// 入口。画面は DOM + CSS(PLAN §7。Phaser は使わない)。中身は src/game/logic.ts、画面は src/ui/。
import { installTuning } from './core/tuning';
import { installInAppBanner } from './core/inapp';
import { startApp } from './ui/app';

startApp(document.getElementById('game-container')!);
installTuning();
installInAppBanner(); // SNS のアプリ内ブラウザなら「ブラウザで開く」を出す(core/inapp.ts)
