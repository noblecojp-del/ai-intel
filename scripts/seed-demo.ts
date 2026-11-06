// 画面確認用のデモデータを投入（is_demo=true。管理画面から削除可）
import { seedDemo } from "../lib/demo";
(async () => {
  await seedDemo();
  console.log("デモデータを投入しました");
  process.exit(0);
})();
