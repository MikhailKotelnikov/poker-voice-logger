#!/usr/bin/env python3
import json
import math
import sys


def emit(payload):
    sys.stdout.write(json.dumps(payload, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def box_center(box):
    try:
        xs = [float(p[0]) for p in box]
        ys = [float(p[1]) for p in box]
        if not xs or not ys:
            return None, None
        return sum(xs) / len(xs), sum(ys) / len(ys)
    except Exception:
        return None, None


def main():
    if len(sys.argv) < 2:
        emit({"type": "error", "stage": "args", "message": "Usage: video-ocr-helper.py <videoPath> [sampleMs] [maxFrames] [startMs] [endMs]"})
        return 1

    video_path = sys.argv[1]
    sample_ms = max(100, int(sys.argv[2])) if len(sys.argv) >= 3 else 1000
    max_frames = max(1, int(sys.argv[3])) if len(sys.argv) >= 4 else 600
    start_ms = 0.0
    end_ms = None
    if len(sys.argv) >= 5:
        start_ms = max(0.0, float(sys.argv[4]))
    if len(sys.argv) >= 6:
        candidate_end = float(sys.argv[5])
        if math.isfinite(candidate_end) and candidate_end >= 0.0:
            end_ms = candidate_end
    if end_ms is not None and end_ms < start_ms:
        end_ms = start_ms

    try:
        import cv2
        from rapidocr_onnxruntime import RapidOCR
    except Exception as exc:
        emit({
            "type": "error",
            "stage": "imports",
            "message": f"Missing OCR dependencies: {exc}",
            "hint": "Install with: python3 -m pip install --target <path> rapidocr-onnxruntime"
        })
        return 2

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        emit({"type": "error", "stage": "reader_open", "message": "Cannot open video file."})
        return 3

    fps = cap.get(cv2.CAP_PROP_FPS) or 0.0
    frame_count = cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0.0
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
    duration_ms = (frame_count / fps * 1000.0) if fps > 0 and frame_count > 0 else 0.0

    emit({
        "type": "meta",
        "duration_ms": duration_ms,
        "width": width,
        "height": height,
        "fps": fps,
        "sample_ms": sample_ms,
        "max_frames": max_frames,
        "start_ms": start_ms,
        "end_ms": end_ms,
        "decoder": "opencv"
    })

    try:
        ocr = RapidOCR()
    except Exception as exc:
        cap.release()
        emit({"type": "error", "stage": "ocr_init", "message": str(exc)})
        return 4

    sample_interval_frames = 1
    if fps > 0:
        sample_interval_frames = max(1, int(round((sample_ms / 1000.0) * fps)))

    sampled = 0
    frame_index = int(cap.get(cv2.CAP_PROP_POS_FRAMES) or 0)
    read_index = 0
    if start_ms > 0.0:
        cap.set(cv2.CAP_PROP_POS_MSEC, start_ms)
        frame_index = int(cap.get(cv2.CAP_PROP_POS_FRAMES) or 0)

    try:
        while sampled < max_frames:
            ok, frame = cap.read()
            if not ok:
                break

            frame_index = int(cap.get(cv2.CAP_PROP_POS_FRAMES) or (frame_index + 1)) - 1

            if read_index % sample_interval_frames != 0:
                read_index += 1
                continue

            frame_ms = cap.get(cv2.CAP_PROP_POS_MSEC)
            if not isinstance(frame_ms, (int, float)) or not math.isfinite(frame_ms) or frame_ms < 0:
                frame_ms = (frame_index / fps * 1000.0) if fps > 0 else float(frame_index * sample_ms)

            if frame_ms < (start_ms - max(5.0, sample_ms * 0.2)):
                read_index += 1
                continue

            if end_ms is not None and frame_ms > (end_ms + max(5.0, sample_ms * 0.4)):
                break

            lines = []
            try:
                result, _ = ocr(frame)
                if result:
                    for item in result:
                        text = str(item[1]).strip() if len(item) > 1 else ""
                        conf = float(item[2]) if len(item) > 2 else 0.0
                        if not text or conf < 0.25:
                            continue

                        bbox = item[0] if len(item) > 0 else None
                        cx, cy = box_center(bbox) if bbox else (None, None)

                        lines.append({
                            "text": text,
                            "confidence": conf,
                            "bbox": bbox,
                            "cx": cx,
                            "cy": cy
                        })
            except Exception as exc:
                emit({"type": "warn", "stage": "ocr", "ms": frame_ms, "message": str(exc)})

            emit({
                "type": "frame",
                "ms": frame_ms,
                "frame_index": frame_index,
                "lines": lines,
                "observation_count": len(lines)
            })

            sampled += 1
            read_index += 1
    finally:
        cap.release()

    emit({"type": "done", "sampled": sampled, "reader_status": 1})
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
