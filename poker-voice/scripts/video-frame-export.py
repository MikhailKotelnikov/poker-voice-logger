#!/usr/bin/env python3
import json
import os
import sys


def emit(payload):
    sys.stdout.write(json.dumps(payload, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def collect_unique_event_ms(payload):
    values = []
    for hand in payload.get("hands", []):
        if not isinstance(hand, dict):
            continue
        for event in hand.get("events", []):
            if not isinstance(event, dict):
                continue
            evidence = event.get("evidence", {})
            ms = evidence.get("frame_ms")
            if isinstance(ms, (int, float)):
                values.append(int(round(ms)))
    return sorted(set([value for value in values if value >= 0]))


def main():
    if len(sys.argv) < 4:
        emit(
            {
                "type": "error",
                "stage": "args",
                "message": "Usage: video-frame-export.py <videoPath> <eventsJsonPath> <framesOutDir>",
            }
        )
        return 1

    video_path = sys.argv[1]
    events_json_path = sys.argv[2]
    frames_out_dir = sys.argv[3]

    try:
        import cv2
    except Exception as exc:
        emit(
            {
                "type": "error",
                "stage": "imports",
                "message": f"Missing dependency: {exc}",
                "hint": "Install opencv via rapidocr-onnxruntime dependency path.",
            }
        )
        return 2

    try:
        with open(events_json_path, "r", encoding="utf-8") as fh:
            payload = json.load(fh)
    except Exception as exc:
        emit({"type": "error", "stage": "events_read", "message": str(exc)})
        return 3

    timestamps = collect_unique_event_ms(payload)
    os.makedirs(frames_out_dir, exist_ok=True)

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        emit({"type": "error", "stage": "video_open", "message": "Cannot open video file."})
        return 4

    warnings = []
    frame_map = {}
    written = 0

    try:
        for index, ms in enumerate(timestamps, start=1):
            cap.set(cv2.CAP_PROP_POS_MSEC, float(ms))
            ok, frame = cap.read()
            if not ok or frame is None:
                warnings.append({"ms": ms, "message": "Failed to decode frame at timestamp."})
                continue

            filename = f"frame_{index:04d}_{ms:08d}ms.jpg"
            out_path = os.path.join(frames_out_dir, filename)
            save_ok = cv2.imwrite(out_path, frame, [int(cv2.IMWRITE_JPEG_QUALITY), 88])
            if not save_ok:
                warnings.append({"ms": ms, "message": "Failed to write JPEG file."})
                continue

            frame_map[str(ms)] = filename
            written += 1
    finally:
        cap.release()

    emit(
        {
            "type": "done",
            "requested_timestamps": len(timestamps),
            "frames_written": written,
            "frame_map": frame_map,
            "warnings": warnings,
        }
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
