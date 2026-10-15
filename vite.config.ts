import { defineConfig } from 'vite';

// base './' : Pages でも itch.io でも同じ dist が動く(相対パス)
// version.json: 画面の隅の BUILD ID と照合し、違えば自動リロードする(AGENTS.md「直したのに直らない」対策。src/ui/build.ts)
const VERSION = process.env.GITHUB_SHA?.slice(0, 7) ?? 'local';

export default defineConfig({
  base: './',
  define: {
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    __GIT_SHA__: JSON.stringify(VERSION),
  },
  plugins: [{
    name: 'version-json',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ version: VERSION }) });
    },
  }],
});
