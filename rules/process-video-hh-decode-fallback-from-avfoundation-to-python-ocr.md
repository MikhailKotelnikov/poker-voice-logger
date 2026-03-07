# Title

Video-HH Decode Must Fallback From AVFoundation To Python OCR Stack

## Problem

Some MP4 files are readable by metadata APIs but fail frame decoding in AVFoundation (`Cannot Decode`), which can block OCR extraction despite valid video input.

## Rule

When AVFoundation-based frame decoding fails in the video-to-HH pipeline, then fallback to a software decode+OCR path (`opencv + rapidocr`) before declaring extractor failure, because software codecs often decode streams that fail in the platform media stack.

## Examples

### Positive

- Baseline extractor first tries Python OCR helper (`opencv` decode), then AVFoundation helper only as fallback, and records the chosen extractor stage in run manifest.

### Anti-pattern

- Treat any AVFoundation `Cannot Decode` as final failure and return zero events without trying software decode.

## Validation Checklist

- [ ] Extractor attempts at least one non-AVFoundation decode path.
- [ ] Manifest includes actual extractor stage used.
- [ ] Failure artifacts include explicit stage-level decode errors.
- [ ] Smoke run proves non-zero events on at least one sample video.
