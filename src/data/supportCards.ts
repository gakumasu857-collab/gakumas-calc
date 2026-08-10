/**
 * サポートカードのマスターデータ。
 *
 * SSR の96枚は R2 バケット (gakumas-image) の実ファイル一覧から自動生成。
 * 画像キーの命名規則: "<カード名>.webp"（バケット直下フラット配置。レアリティは rarity 列が持つ）
 * （最新のサポカ、および R / SR / EventSSR は未収録。追加時はこの配列に追記する）
 *
 * 表示URLは lib/config.ts の imageUrl() が
 *   NEXT_PUBLIC_IMAGE_BASE_URL + "/" + encodeURIComponent(image)
 * として組み立てる。
 */

export type Rarity = "R" | "SR" | "SSR" | "EventSSR";

/** フィルターの選択肢（「すべて」＋各レアリティ） */
export type RarityFilterValue = "すべて" | Rarity;

export type SupportCard = {
  /** 保存キーにも使う安定したID（画像を差し替えても変えないこと） */
  id: string;
  /** カード名（ホバー/スマホで表示） */
  name: string;
  rarity: Rarity;
  /** R2 バケット内の画像キー。未確定のうちは空文字。 */
  image: string;
};

export const SUPPORT_CARDS: SupportCard[] = [
  { id: "ssr:「ア」じゃなくて「エ」！", name: "「ア」じゃなくて「エ」！", rarity: "SSR", image: "「ア」じゃなくて「エ」！.webp" },
  { id: "ssr:1人たりとも欠ける事なく", name: "1人たりとも欠ける事なく", rarity: "SSR", image: "1人たりとも欠ける事なく.webp" },
  { id: "ssr:ｖギャルピーーースッｖ", name: "ｖギャルピーーースッｖ", rarity: "SSR", image: "ｖギャルピーーースッｖ.webp" },
  { id: "ssr:あたしの勝ち、ですね～！", name: "あたしの勝ち、ですね～！", rarity: "SSR", image: "あたしの勝ち、ですね～！.webp" },
  { id: "ssr:あったかいね", name: "あったかいね", rarity: "SSR", image: "あったかいね.webp" },
  { id: "ssr:あっちも行きたいですわ！", name: "あっちも行きたいですわ！", rarity: "SSR", image: "あっちも行きたいですわ！.webp" },
  { id: "ssr:あなたたちのことが好き", name: "あなたたちのことが好き", rarity: "SSR", image: "あなたたちのことが好き.webp" },
  { id: "ssr:あなたとふたり、電車で", name: "あなたとふたり、電車で", rarity: "SSR", image: "あなたとふたり、電車で.webp" },
  { id: "ssr:あなたにも作ってあげる！", name: "あなたにも作ってあげる！", rarity: "SSR", image: "あなたにも作ってあげる！.webp" },
  { id: "ssr:あら、奇遇ね", name: "あら、奇遇ね", rarity: "SSR", image: "あら、奇遇ね.webp" },
  { id: "ssr:いつまでも続けばいいのに", name: "いつまでも続けばいいのに", rarity: "SSR", image: "いつまでも続けばいいのに.webp" },
  { id: "ssr:いつも頑張ってるね。", name: "いつも頑張ってるね。", rarity: "SSR", image: "いつも頑張ってるね。.webp" },
  { id: "ssr:おい、来てやったぞ！", name: "おい、来てやったぞ！", rarity: "SSR", image: "おい、来てやったぞ！.webp" },
  { id: "ssr:おいしい顔、いただき～！", name: "おいしい顔、いただき～！", rarity: "SSR", image: "おいしい顔、いただき～！.webp" },
  { id: "ssr:オシャレもメイクも♪", name: "オシャレもメイクも♪", rarity: "SSR", image: "オシャレもメイクも♪.webp" },
  { id: "ssr:おっと、危ないよ", name: "おっと、危ないよ", rarity: "SSR", image: "おっと、危ないよ.webp" },
  { id: "ssr:お姉ちゃんに任せなさい！", name: "お姉ちゃんに任せなさい！", rarity: "SSR", image: "お姉ちゃんに任せなさい！.webp" },
  { id: "ssr:お疲れ様、千奈ちゃん。", name: "お疲れ様、千奈ちゃん。", rarity: "SSR", image: "お疲れ様、千奈ちゃん。.webp" },
  { id: "ssr:お母さんか！", name: "お母さんか！", rarity: "SSR", image: "お母さんか！.webp" },
  { id: "ssr:かかってらっしゃい！", name: "かかってらっしゃい！", rarity: "SSR", image: "かかってらっしゃい！.webp" },
  { id: "ssr:キラキラして綺麗～っ！", name: "キラキラして綺麗～っ！", rarity: "SSR", image: "キラキラして綺麗～っ！.webp" },
  { id: "ssr:クールダウンが大切よ！", name: "クールダウンが大切よ！", rarity: "SSR", image: "クールダウンが大切よ！.webp" },
  { id: "ssr:ぐぬぬぬぬ…………！", name: "ぐぬぬぬぬ…………！", rarity: "SSR", image: "ぐぬぬぬぬ…………！.webp" },
  { id: "ssr:こいつらめんどくさー", name: "こいつらめんどくさー", rarity: "SSR", image: "こいつらめんどくさー.webp" },
  { id: "ssr:これが私達の、3年間", name: "これが私達の、3年間", rarity: "SSR", image: "これが私達の、3年間.webp" },
  { id: "ssr:これは――お城ッ！！", name: "これは――お城ッ！！", rarity: "SSR", image: "これは――お城ッ！！.webp" },
  { id: "ssr:さあ、もう一戦！", name: "さあ、もう一戦！", rarity: "SSR", image: "さあ、もう一戦！.webp" },
  { id: "ssr:さみだれ", name: "さみだれ", rarity: "SSR", image: "さみだれ.webp" },
  { id: "ssr:すっかり秋色ですわね！", name: "すっかり秋色ですわね！", rarity: "SSR", image: "すっかり秋色ですわね！.webp" },
  { id: "ssr:すっかり仲良しって感じ♪", name: "すっかり仲良しって感じ♪", rarity: "SSR", image: "すっかり仲良しって感じ♪.webp" },
  { id: "ssr:ぜったいに取るんだ！", name: "ぜったいに取るんだ！", rarity: "SSR", image: "ぜったいに取るんだ！.webp" },
  { id: "ssr:ぜったい追いついてやる！", name: "ぜったい追いついてやる！", rarity: "SSR", image: "ぜったい追いついてやる！.webp" },
  { id: "ssr:そろそろ焼けたかな？", name: "そろそろ焼けたかな？", rarity: "SSR", image: "そろそろ焼けたかな？.webp" },
  { id: "ssr:ちょっと詳しいんです！", name: "ちょっと詳しいんです！", rarity: "SSR", image: "ちょっと詳しいんです！.webp" },
  { id: "ssr:どんな関係なんですか？", name: "どんな関係なんですか？", rarity: "SSR", image: "どんな関係なんですか？.webp" },
  { id: "ssr:なぜこんなところにッ！？", name: "なぜこんなところにッ！？", rarity: "SSR", image: "なぜこんなところにッ！？.webp" },
  { id: "ssr:パーティー楽しみだねっ！", name: "パーティー楽しみだねっ！", rarity: "SSR", image: "パーティー楽しみだねっ！.webp" },
  { id: "ssr:はいっ、みんなも一緒に♪", name: "はいっ、みんなも一緒に♪", rarity: "SSR", image: "はいっ、みんなも一緒に♪.webp" },
  { id: "ssr:バレンタイン♡会議中ーっ！", name: "バレンタイン♡会議中ーっ！", rarity: "SSR", image: "バレンタイン♡会議中ーっ！.webp" },
  { id: "ssr:ひとりごとです", name: "ひとりごとです", rarity: "SSR", image: "ひとりごとです.webp" },
  { id: "ssr:ひとりで立てますか？", name: "ひとりで立てますか？", rarity: "SSR", image: "ひとりで立てますか？.webp" },
  { id: "ssr:プロデュースって大変ね", name: "プロデュースって大変ね", rarity: "SSR", image: "プロデュースって大変ね.webp" },
  { id: "ssr:ほら、一緒に持と♪", name: "ほら、一緒に持と♪", rarity: "SSR", image: "ほら、一緒に持と♪.webp" },
  { id: "ssr:まじか。", name: "まじか。", rarity: "SSR", image: "まじか。.webp" },
  { id: "ssr:また、あんなに無理をして", name: "また、あんなに無理をして", rarity: "SSR", image: "また、あんなに無理をして.webp" },
  { id: "ssr:まだ上がりませんように！", name: "まだ上がりませんように！", rarity: "SSR", image: "まだ上がりませんように！.webp" },
  { id: "ssr:まるで王子様みたいな", name: "まるで王子様みたいな", rarity: "SSR", image: "まるで王子様みたいな.webp" },
  { id: "ssr:みいつけた。", name: "みいつけた。", rarity: "SSR", image: "みいつけた。.webp" },
  { id: "ssr:みんなの意見を聞かせて♪", name: "みんなの意見を聞かせて♪", rarity: "SSR", image: "みんなの意見を聞かせて♪.webp" },
  { id: "ssr:メリクリ、おねーちゃん♪", name: "メリクリ、おねーちゃん♪", rarity: "SSR", image: "メリクリ、おねーちゃん♪.webp" },
  { id: "ssr:もうっ！　冷たいよ！", name: "もうっ！　冷たいよ！", rarity: "SSR", image: "もうっ！　冷たいよ！.webp" },
  { id: "ssr:もう一度、最初から！", name: "もう一度、最初から！", rarity: "SSR", image: "もう一度、最初から！.webp" },
  { id: "ssr:やっと見つけたぞ！", name: "やっと見つけたぞ！", rarity: "SSR", image: "やっと見つけたぞ！.webp" },
  { id: "ssr:ゆっくりと過ごしましょう", name: "ゆっくりと過ごしましょう", rarity: "SSR", image: "ゆっくりと過ごしましょう.webp" },
  { id: "ssr:レディ・セット、ゴー！", name: "レディ・セット、ゴー！", rarity: "SSR", image: "レディ・セット、ゴー！.webp" },
  { id: "ssr:わたしたち、やればできる", name: "わたしたち、やればできる", rarity: "SSR", image: "わたしたち、やればできる.webp" },
  { id: "ssr:わたしと美鈴、超仲良し", name: "わたしと美鈴、超仲良し", rarity: "SSR", image: "わたしと美鈴、超仲良し.webp" },
  { id: "ssr:一時休戦です", name: "一時休戦です", rarity: "SSR", image: "一時休戦です.webp" },
  { id: "ssr:何やってるんだろう、", name: "何やってるんだろう、", rarity: "SSR", image: "何やってるんだろう、.webp" },
  { id: "ssr:可愛いと可愛いで可愛い！", name: "可愛いと可愛いで可愛い！", rarity: "SSR", image: "可愛いと可愛いで可愛い！.webp" },
  { id: "ssr:夏を楽しみましょう！", name: "夏を楽しみましょう！", rarity: "SSR", image: "夏を楽しみましょう！.webp" },
  { id: "ssr:夏を満喫するわよ！", name: "夏を満喫するわよ！", rarity: "SSR", image: "夏を満喫するわよ！.webp" },
  { id: "ssr:花火、やりませんか……？", name: "花火、やりませんか……？", rarity: "SSR", image: "花火、やりませんか……？.webp" },
  { id: "ssr:会長、準備は万端です", name: "会長、準備は万端です", rarity: "SSR", image: "会長、準備は万端です.webp" },
  { id: "ssr:君は自慢の生徒です", name: "君は自慢の生徒です", rarity: "SSR", image: "君は自慢の生徒です.webp" },
  { id: "ssr:月村手毬、興味深いわね", name: "月村手毬、興味深いわね", rarity: "SSR", image: "月村手毬、興味深いわね.webp" },
  { id: "ssr:合格おめでとう！", name: "合格おめでとう！", rarity: "SSR", image: "合格おめでとう！.webp" },
  { id: "ssr:仕事のつもりで臨みなさい", name: "仕事のつもりで臨みなさい", rarity: "SSR", image: "仕事のつもりで臨みなさい.webp" },
  { id: "ssr:思い出の宝箱だ、ね", name: "思い出の宝箱だ、ね", rarity: "SSR", image: "思い出の宝箱だ、ね.webp" },
  { id: "ssr:私の目に狂いはない", name: "私の目に狂いはない", rarity: "SSR", image: "私の目に狂いはない.webp" },
  { id: "ssr:似合うんじゃない？", name: "似合うんじゃない？", rarity: "SSR", image: "似合うんじゃない？.webp" },
  { id: "ssr:次の桜の季節には。", name: "次の桜の季節には。", rarity: "SSR", image: "次の桜の季節には。.webp" },
  { id: "ssr:自分と向き合う時間だ", name: "自分と向き合う時間だ", rarity: "SSR", image: "自分と向き合う時間だ.webp" },
  { id: "ssr:主菓子、甘い、薄茶、渋み", name: "主菓子、甘い、薄茶、渋み", rarity: "SSR", image: "主菓子、甘い、薄茶、渋み.webp" },
  { id: "ssr:手毬のリサイタル、だね", name: "手毬のリサイタル、だね", rarity: "SSR", image: "手毬のリサイタル、だね.webp" },
  { id: "ssr:上かッ！！", name: "上かッ！！", rarity: "SSR", image: "上かッ！！.webp" },
  { id: "ssr:食欲の秋なんです", name: "食欲の秋なんです", rarity: "SSR", image: "食欲の秋なんです.webp" },
  { id: "ssr:新たな挑戦の成功ですわ！", name: "新たな挑戦の成功ですわ！", rarity: "SSR", image: "新たな挑戦の成功ですわ！.webp" },
  { id: "ssr:新生活のはじまりだね", name: "新生活のはじまりだね", rarity: "SSR", image: "新生活のはじまりだね.webp" },
  { id: "ssr:進化したお弁当、気になる", name: "進化したお弁当、気になる", rarity: "SSR", image: "進化したお弁当、気になる.webp" },
  { id: "ssr:推し活なひととき、だね！", name: "推し活なひととき、だね！", rarity: "SSR", image: "推し活なひととき、だね！.webp" },
  { id: "ssr:晴れたね", name: "晴れたね", rarity: "SSR", image: "晴れたね.webp" },
  { id: "ssr:盛り上げてこー！", name: "盛り上げてこー！", rarity: "SSR", image: "盛り上げてこー！.webp" },
  { id: "ssr:絶対にお渡ししますわっ！", name: "絶対にお渡ししますわっ！", rarity: "SSR", image: "絶対にお渡ししますわっ！.webp" },
  { id: "ssr:相手にとって不足なしよ！", name: "相手にとって不足なしよ！", rarity: "SSR", image: "相手にとって不足なしよ！.webp" },
  { id: "ssr:相変わらず不器用ね", name: "相変わらず不器用ね", rarity: "SSR", image: "相変わらず不器用ね.webp" },
  { id: "ssr:待ちなさーい！", name: "待ちなさーい！", rarity: "SSR", image: "待ちなさーい！.webp" },
  { id: "ssr:貸せ、手本を見せてやる！", name: "貸せ、手本を見せてやる！", rarity: "SSR", image: "貸せ、手本を見せてやる！.webp" },
  { id: "ssr:大運動会、開催っ！", name: "大運動会、開催っ！", rarity: "SSR", image: "大運動会、開催っ！.webp" },
  { id: "ssr:第2回教室パーティー！", name: "第2回教室パーティー！", rarity: "SSR", image: "第2回教室パーティー！.webp" },
  { id: "ssr:長旅おつかれさま！", name: "長旅おつかれさま！", rarity: "SSR", image: "長旅おつかれさま！.webp" },
  { id: "ssr:堂々とサボってる！？", name: "堂々とサボってる！？", rarity: "SSR", image: "堂々とサボってる！？.webp" },
  { id: "ssr:二人ならあっという間だね", name: "二人ならあっという間だね", rarity: "SSR", image: "二人ならあっという間だね.webp" },
  { id: "ssr:放っておけない気になる子", name: "放っておけない気になる子", rarity: "SSR", image: "放っておけない気になる子.webp" },
  { id: "ssr:迷子のおしらせです", name: "迷子のおしらせです", rarity: "SSR", image: "迷子のおしらせです.webp" },
  { id: "ssr:利用し合うのが友達！", name: "利用し合うのが友達！", rarity: "SSR", image: "利用し合うのが友達！.webp" },
];
