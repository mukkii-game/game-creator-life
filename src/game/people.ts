// 名前を苗字と名前に分ける。スペース(全角も)で分けてあればそれに従い、無ければ推測する。描画なし・乱数なし。
const ONE = '林森原東西関堀岡辻谷星泉宮菅楠稲南北畑沢沖桜幸桂島坂峰';
const THREE = ['佐々木', '長谷川', '五十嵐', '久保田', '小野寺', '宇都宮', '大久保', '小田切', '日比野', '勅使河原', '長曾我部', '寺之内', '阿久津', '小笠原', '曽我部', '大和田', '佐久間', '宇佐美', '小早川', '江戸川', '海老原', '香取', '伊集院', '東海林', '御手洗', '八重樫', '二階堂', '早乙女', '加賀谷'];

export interface NameParts { family: string; given: string }

export function splitName(raw: string): NameParts {
  const t = raw.replace(/　/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t) return { family: '', given: '' };
  const parts = t.split(' ');
  if (parts.length >= 2) {
    // 英字の「Taro Yamada」は後ろが苗字。日本語は前が苗字
    if (/^[A-Za-z]/.test(t)) return { family: parts[parts.length - 1], given: parts.slice(0, -1).join(' ') };
    return { family: parts[0], given: parts.slice(1).join(' ') };
  }
  // 漢字だけなら苗字を推測。かな・カナ・英字 1 語はあだ名として名前だけ
  if (!/^[一-鿿々]+$/.test(t) || t.length < 2) return { family: '', given: t };
  const three = THREE.find((f) => t.startsWith(f) && t.length > f.length);
  if (three) return { family: three, given: t.slice(three.length) };
  if (t.length === 2 || (t.length === 3 && ONE.includes(t[0]))) return { family: t[0], given: t.slice(1) };
  return { family: t.slice(0, 2), given: t.slice(2) };
}

/** 他の人の人生(サーバーから。名前を自分で入れた人だけ) */
export interface OtherLife { family: string; given: string; startYear: number; endYear: number; startAge: number; endAge: number; job: string; company: string; work: string; ending: string }

/** 呼び方: 苗字があれば「山田さん」、無ければ「りょうさん」 */
export const callName = (o: { family: string; given: string }) => `${o.family || o.given}さん`;
export const fullName = (o: { family: string; given: string }) => (o.family && o.given ? `${o.family} ${o.given}` : o.family || o.given);
