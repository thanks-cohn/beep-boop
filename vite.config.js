import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
    plugins: [],
    build: {
        rollupOptions: {
            input: {
                main: resolve(__dirname, "index.html"),
                mobile: resolve(__dirname, "mobile.html")
            }
        }
    }
});
