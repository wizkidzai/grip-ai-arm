import { useEffect, useRef, useState } from 'react';

const PREFS_KEY = 'grip.camera';

interface Prefs {
  deviceId?: string;
  flipped?: boolean;
}

function loadPrefs(): Prefs {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') as Prefs;
  } catch {
    return {};
  }
}

function savePrefs(p: Prefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {
    /* fine */
  }
}

/** Laptop cameras usually come first; a camera added for the robot usually comes last. */
const looksBuiltIn = (label: string) => /integrated|built-?in|facetime|fhd uvc webcam|hd webcam/i.test(label);

function pickCamera(cams: MediaDeviceInfo[], saved?: string): string | undefined {
  if (saved && cams.some((c) => c.deviceId === saved)) return saved;
  const external = cams.filter((c) => !looksBuiltIn(c.label));
  return (external[external.length - 1] ?? cams[cams.length - 1])?.deviceId;
}

/**
 * Live view from a camera (e.g. the one on the robot's wrist).
 * Off by default. Video stays in this browser: nothing is recorded, saved or sent.
 */
export function CameraView() {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [on, setOn] = useState(false);
  const [cams, setCams] = useState<MediaDeviceInfo[]>([]);
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const update = (p: Prefs) => {
    setPrefs(p);
    savePrefs(p);
  };

  const stop = () => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    if (video.current) video.current.srcObject = null;
    setOn(false);
  };

  const start = async (deviceId?: string) => {
    setError(null);
    setStarting(true);
    stream.current?.getTracks().forEach((t) => t.stop());
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('unsupported');
      const constraints = (id?: string): MediaStreamConstraints => ({
        audio: false,
        video: { ...(id ? { deviceId: { exact: id } } : {}), width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      let s = await navigator.mediaDevices.getUserMedia(constraints(deviceId));
      // Camera names are only visible after permission, so pick the robot camera now.
      const list = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
      setCams(list);
      const want = deviceId ?? pickCamera(list, prefs.deviceId);
      const current = s.getVideoTracks()[0]?.getSettings().deviceId;
      if (want && want !== current) {
        s.getTracks().forEach((t) => t.stop());
        s = await navigator.mediaDevices.getUserMedia(constraints(want));
      }
      stream.current = s;
      if (video.current) video.current.srcObject = s;
      const used = s.getVideoTracks()[0]?.getSettings().deviceId;
      if (used) update({ ...prefs, deviceId: used });
      setOn(true);
    } catch (e) {
      const name = (e as Error)?.name;
      setError(
        name === 'NotAllowedError'
          ? 'The browser is not allowed to use the camera. Click the camera icon in the address bar and choose "Allow".'
          : name === 'NotReadableError'
            ? 'The camera is busy. Close other apps that use it (video calls, other tabs), then try again.'
            : name === 'NotFoundError' || name === 'OverconstrainedError'
              ? 'No camera found. Check the camera’s USB cable, then try again.'
              : 'The camera did not start. Unplug it, plug it back in, and try again.',
      );
      setOn(false);
    } finally {
      setStarting(false);
    }
  };

  // Release the camera when this view goes away.
  useEffect(() => () => stream.current?.getTracks().forEach((t) => t.stop()), []);

  const activeId = stream.current?.getVideoTracks()[0]?.getSettings().deviceId;

  return (
    <section className="camera card" aria-labelledby="camera-title">
      <div className="row spread">
        <h3 id="camera-title">📷 Camera</h3>
        {on && (
          <span className="cam-live" role="status">
            <span className="dot" aria-hidden="true" /> Camera on
          </span>
        )}
      </div>

      <div className={`cam-frame ${on ? '' : 'off'}`}>
        <video
          ref={video}
          autoPlay
          playsInline
          muted
          className={prefs.flipped ? 'flipped' : ''}
          aria-label="Live view from the robot camera"
        />
        {!on && (
          <div className="cam-placeholder">
            <p>See what the robot sees!</p>
            <button className="btn primary" onClick={() => start()} disabled={starting}>
              {starting ? 'Starting…' : '📷 Turn camera on'}
            </button>
          </div>
        )}
      </div>

      {on && (
        <div className="row cam-controls">
          {cams.length > 1 && (
            <label className="inline-field">
              Camera
              <select value={activeId ?? ''} onChange={(e) => start(e.target.value)}>
                {cams.map((c, i) => (
                  <option key={c.deviceId} value={c.deviceId}>
                    {c.label || `Camera ${i + 1}`}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button
            className="btn small"
            aria-pressed={!!prefs.flipped}
            onClick={() => update({ ...prefs, flipped: !prefs.flipped })}
          >
            🔄 Flip
          </button>
          <button className="btn small" onClick={stop}>
            Turn off
          </button>
        </div>
      )}
      {error && (
        <p className="callout warn" role="alert">
          {error}
        </p>
      )}
      <p className="hint">The video stays on this computer. Nothing is recorded or sent anywhere.</p>
    </section>
  );
}
