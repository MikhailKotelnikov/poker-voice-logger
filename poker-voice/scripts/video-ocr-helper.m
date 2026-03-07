#import <Foundation/Foundation.h>
#import <AVFoundation/AVFoundation.h>
#import <Vision/Vision.h>
#import <CoreImage/CoreImage.h>
#import <CoreMedia/CoreMedia.h>
#import <CoreVideo/CoreVideo.h>

static NSString *fourCCToString(FourCharCode code) {
  char c[5];
  c[0] = (char)((code >> 24) & 0xFF);
  c[1] = (char)((code >> 16) & 0xFF);
  c[2] = (char)((code >> 8) & 0xFF);
  c[3] = (char)(code & 0xFF);
  c[4] = '\0';
  return [NSString stringWithCString:c encoding:NSMacOSRomanStringEncoding] ?: @"????";
}

static void emitJson(NSDictionary *payload) {
  NSError *error = nil;
  NSData *data = [NSJSONSerialization dataWithJSONObject:payload options:0 error:&error];
  if (!data) {
    fprintf(stderr, "json_encode_error:%s\n", [[error localizedDescription] UTF8String]);
    return;
  }
  fwrite(data.bytes, 1, data.length, stdout);
  fwrite("\n", 1, 1, stdout);
  fflush(stdout);
}

int main(int argc, const char * argv[]) {
  @autoreleasepool {
    if (argc < 2) {
      emitJson(@{ @"type": @"error", @"stage": @"args", @"message": @"Usage: video-ocr-helper <videoPath> [sampleMs] [maxFrames]" });
      return 1;
    }

    NSString *videoPath = [NSString stringWithUTF8String:argv[1]];
    NSInteger sampleMs = (argc >= 3) ? MAX(100, atoi(argv[2])) : 1200;
    NSInteger maxFrames = (argc >= 4) ? MAX(1, atoi(argv[3])) : 600;

    NSURL *url = [NSURL fileURLWithPath:videoPath];
    AVAsset *asset = [AVAsset assetWithURL:url];
    NSArray<AVAssetTrack *> *tracks = [asset tracksWithMediaType:AVMediaTypeVideo];
    if (tracks.count == 0) {
      emitJson(@{ @"type": @"error", @"stage": @"tracks", @"message": @"No video tracks found." });
      return 2;
    }

    AVAssetTrack *track = tracks.firstObject;
    NSString *codec = @"unknown";
    if (track.formatDescriptions.count > 0) {
      CMFormatDescriptionRef fd = (__bridge CMFormatDescriptionRef)track.formatDescriptions[0];
      codec = fourCCToString(CMFormatDescriptionGetMediaSubType(fd));
    }

    Float64 durationSec = CMTimeGetSeconds(asset.duration);
    emitJson(@{
      @"type": @"meta",
      @"duration_ms": @(isfinite(durationSec) && durationSec > 0 ? durationSec * 1000.0 : 0),
      @"width": @(track.naturalSize.width),
      @"height": @(track.naturalSize.height),
      @"codec": codec,
      @"sample_ms": @(sampleMs),
      @"max_frames": @(maxFrames)
    });

    NSError *readerError = nil;
    AVAssetReader *reader = [[AVAssetReader alloc] initWithAsset:asset error:&readerError];
    if (!reader) {
      emitJson(@{ @"type": @"error", @"stage": @"reader_init", @"message": readerError.localizedDescription ?: @"Unable to initialize AVAssetReader." });
      return 3;
    }

    NSDictionary *settings = @{ (id)kCVPixelBufferPixelFormatTypeKey: @(kCVPixelFormatType_32BGRA) };
    AVAssetReaderTrackOutput *output = [[AVAssetReaderTrackOutput alloc] initWithTrack:track outputSettings:settings];
    output.alwaysCopiesSampleData = NO;
    if (![reader canAddOutput:output]) {
      emitJson(@{ @"type": @"error", @"stage": @"reader_output", @"message": @"Cannot add video output to AVAssetReader." });
      return 4;
    }
    [reader addOutput:output];

    if (![reader startReading]) {
      emitJson(@{ @"type": @"error", @"stage": @"reader_start", @"message": reader.error.localizedDescription ?: @"Cannot decode video stream." });
      return 5;
    }

    CIContext *ciContext = [CIContext contextWithOptions:nil];
    double lastSampledMs = -1;
    NSInteger sampled = 0;

    while (sampled < maxFrames) {
      CMSampleBufferRef sample = [output copyNextSampleBuffer];
      if (!sample) {
        break;
      }

      CMTime pts = CMSampleBufferGetPresentationTimeStamp(sample);
      Float64 seconds = CMTimeGetSeconds(pts);
      if (!isfinite(seconds) || seconds < 0) {
        CFRelease(sample);
        continue;
      }

      double frameMs = seconds * 1000.0;
      if (lastSampledMs >= 0 && (frameMs - lastSampledMs) < sampleMs) {
        CFRelease(sample);
        continue;
      }

      CVImageBufferRef imageBuffer = CMSampleBufferGetImageBuffer(sample);
      if (!imageBuffer) {
        CFRelease(sample);
        continue;
      }

      CIImage *ciImage = [CIImage imageWithCVPixelBuffer:imageBuffer];
      CGRect extent = ciImage.extent;
      CGImageRef cgImage = [ciContext createCGImage:ciImage fromRect:extent];
      if (!cgImage) {
        CFRelease(sample);
        continue;
      }

      VNRecognizeTextRequest *request = [[VNRecognizeTextRequest alloc] init];
      request.recognitionLevel = VNRequestTextRecognitionLevelFast;
      request.usesLanguageCorrection = NO;
      request.recognitionLanguages = @[ @"en-US" ];

      VNImageRequestHandler *handler = [[VNImageRequestHandler alloc] initWithCGImage:cgImage options:@{}];
      NSError *ocrError = nil;
      BOOL ok = [handler performRequests:@[ request ] error:&ocrError];
      CGImageRelease(cgImage);

      if (!ok) {
        emitJson(@{ @"type": @"warn", @"stage": @"ocr", @"ms": @(frameMs), @"message": ocrError.localizedDescription ?: @"OCR failed on frame." });
        CFRelease(sample);
        lastSampledMs = frameMs;
        sampled += 1;
        continue;
      }

      NSMutableArray *lines = [NSMutableArray array];
      NSArray<VNRecognizedTextObservation *> *results = request.results ?: @[];
      for (VNRecognizedTextObservation *observation in results) {
        VNRecognizedText *top = [[observation topCandidates:1] firstObject];
        if (!top) continue;
        NSString *text = [[top.string stringByReplacingOccurrencesOfString:@"\n" withString:@" "] stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceAndNewlineCharacterSet]];
        if (text.length == 0) continue;
        if (top.confidence < 0.15f) continue;
        [lines addObject:@{ @"text": text, @"confidence": @(top.confidence) }];
      }

      emitJson(@{
        @"type": @"frame",
        @"ms": @(frameMs),
        @"lines": lines,
        @"observation_count": @(results.count)
      });

      CFRelease(sample);
      lastSampledMs = frameMs;
      sampled += 1;
    }

    if (reader.status == AVAssetReaderStatusFailed) {
      emitJson(@{ @"type": @"error", @"stage": @"reader_runtime", @"message": reader.error.localizedDescription ?: @"Reader failed while sampling." });
      return 6;
    }

    emitJson(@{ @"type": @"done", @"sampled": @(sampled), @"reader_status": @(reader.status) });
  }
  return 0;
}
