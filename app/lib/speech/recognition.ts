// 浏览器语音识别封装(阶段 0 免费 API):
// 只在不支持的浏览器里返回 null,调用方降级为自评模式;
// 阶段 3 若引入服务端发音评分(如音素级),在此替换实现即可。

type AnySpeechRecognition = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
};

function getCtor(): (new () => AnySpeechRecognition) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => AnySpeechRecognition;
    webkitSpeechRecognition?: new () => AnySpeechRecognition;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function isRecognitionSupported(): boolean {
  return getCtor() !== null;
}

/**
 * 识别一次跟读:resolve 为识别文本;出错/超时 reject(Error)。
 * 调用方捕获后降级为自评。
 */
export function listenOnce(timeoutMs = 8000): Promise<string> {
  const Ctor = getCtor();
  if (!Ctor) return Promise.reject(new Error("当前浏览器不支持语音识别"));
  const rec = new Ctor();
  rec.lang = "en-US";
  rec.interimResults = false;
  rec.maxAlternatives = 1;
  rec.continuous = false;

  return new Promise<string>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        rec.abort();
        reject(new Error("识别超时,请再试一次"));
      }
    }, timeoutMs);

    rec.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript ?? "";
      if (!settled && transcript) {
        settled = true;
        clearTimeout(timer);
        resolve(transcript);
      }
    };
    rec.onerror = (event) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(new Error(`识别失败:${event.error}`));
      }
    };
    rec.onend = () => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(new Error("没有听清,请靠近麦克风再试"));
      }
    };
    rec.start();
  });
}
