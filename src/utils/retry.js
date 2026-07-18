const DEFAULT_RETRIES = 10;
const DEFAULT_INITIAL_DELAY = 350;
const DEFAULT_MAX_DELAY = 4500;
const DEFAULT_BACKOFF = 1.55;

export function retryDelay(attempt, options = {}) {
    const initialDelay = options.initialDelay ?? DEFAULT_INITIAL_DELAY;
    const maxDelay = options.maxDelay ?? DEFAULT_MAX_DELAY;
    const backoff = options.backoff ?? DEFAULT_BACKOFF;
    return Math.min(maxDelay, Math.round(initialDelay * (backoff ** Math.max(0, attempt - 1))));
}

function sleep(ms, signal) {
    if (ms <= 0) return Promise.resolve();
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(resolve, ms);
        signal?.addEventListener("abort", () => {
            clearTimeout(timeout);
            reject(new DOMException("Retry cancelled", "AbortError"));
        }, { once: true });
    });
}

export async function withRetry(operation, options = {}) {
    const retries = options.retries ?? DEFAULT_RETRIES;
    let lastError;

    for (let attempt = 0; attempt <= retries; attempt += 1) {
        if (options.signal?.aborted) throw new DOMException("Retry cancelled", "AbortError");
        try {
            return await operation({ attempt, retries });
        } catch (error) {
            lastError = error;
            if (attempt >= retries || options.signal?.aborted) break;
            options.onRetry?.({ attempt: attempt + 1, retries, error });
            await sleep(retryDelay(attempt + 1, options), options.signal);
        }
    }

    throw lastError;
}

export async function fetchWithRetry(url, fetchOptions = {}, retryOptions = {}) {
    const { parse = null, ...rest } = retryOptions;
    return withRetry(async () => {
        const response = await fetch(url, fetchOptions);
        if (!response.ok) throw new Error(`HTTP ${response.status} loading ${url}`);
        if (parse === "json") return response.json();
        if (parse === "text") return response.text();
        return response;
    }, rest);
}
