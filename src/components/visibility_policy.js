import { normalizeVisibilityPolicy } from "../utils/visibility.js";

export const VISIBILITY_POLICY_URL = "/data/visibility-policy.json";

function warnDev(message, error) {
    if (!import.meta.env?.DEV) return;
    if (error) console.warn(message, error);
    else console.warn(message);
}

export class VisibilityPolicyStore extends EventTarget {
    constructor(provider = null) {
        super();
        this.provider = provider || (() => fetch(VISIBILITY_POLICY_URL, { cache: "no-cache" }).then(response => {
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return response.json();
        }));
        this.policy = normalizeVisibilityPolicy(null);
        this.loading = null;
    }

    async refresh() {
        this.loading = Promise.resolve().then(this.provider).then(raw => normalizeVisibilityPolicy(raw)).catch(error => {
            warnDev("Visibility policy failed to load; using empty rotunda exclusions.", error);
            return normalizeVisibilityPolicy(null);
        }).then(policy => {
            this.policy = policy;
            this.dispatchEvent(new CustomEvent("change", { detail: policy }));
            if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("visibility-policy-changed", { detail: policy }));
            return policy;
        });
        return this.loading;
    }

    get() { return this.policy; }
}

export const visibilityPolicyStore = new VisibilityPolicyStore();
