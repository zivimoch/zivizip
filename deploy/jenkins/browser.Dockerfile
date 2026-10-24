FROM mcr.microsoft.com/playwright:v1.63.0-noble
WORKDIR /app
RUN npm install --global pnpm@10.28.2
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile
ENV PLAYWRIGHT_CHROMIUM_CHANNEL=chromium
COPY apps/web apps/web
RUN pnpm build && mkdir -p /app/.local
WORKDIR /app/apps/web
CMD ["pnpm", "exec", "playwright", "test", "tests/browser/install.spec.ts", "tests/browser/admin.spec.ts", "tests/browser/finance-plan-controls.spec.ts", "tests/browser/tasks-detail.spec.ts", "tests/browser/brand-assets.spec.ts", "tests/browser/draw-clipboard.spec.ts", "tests/browser/goals.spec.ts", "tests/browser/panels.spec.ts", "tests/browser/lists.spec.ts", "tests/browser/editor-tools.spec.ts", "tests/browser/images.spec.ts", "tests/browser/notes.spec.ts", "tests/browser/sharing.spec.ts", "--workers=1"]
