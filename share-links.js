// The links worth handing to someone.
//
// A teacher or a colleague should not be sent to the home page and left to find
// the good part: each entry here opens on a specific moment, and the query
// strings are the same state the page already keeps in the address bar. Shared by
// the page (which renders them) and by tools/make-share-kit.mjs (which turns them
// into QR images), so the two can never drift apart.

export const SHARE_LINKS = [
  {
    id: 'compare',
    title: '两个细胞并排',
    note: '动物细胞与叶肉细胞按同一真实比例并排；点一次「线粒体」，两边同时高亮。',
    query: '?cell=animal-cell&compare=plant-cell',
  },
  {
    id: 'practice',
    title: '随堂辨认练习',
    note: '打开即开始出题：点出指定结构，答错会告诉你点到了什么。',
    query: '?cell=animal-cell&practice=1',
  },
  {
    id: 'scale',
    title: '一把尺子量七类标本',
    note: '真实尺度标尺与同尺度对比图：从 50 µm 的叶肉细胞到 3 µm 的蓝细菌。',
    query: '?cell=plant-cell#size-chart',
  },
  {
    id: 'whole',
    title: '植物的完整外壳',
    note: '先看整体，再切「透明」看细胞壁与细胞膜的分层。',
    query: '?cell=plant-cell&view=whole',
  },
  {
    id: 'mitochondria',
    title: '线粒体与结构标签',
    note: '剖面上的线粒体高亮，配合全部结构标签当一张可点击的标注图。',
    query: '?cell=animal-cell&select=mitochondria&labels=1',
  },
  {
    id: 'rbc',
    title: '红细胞（最快看懂的一个）',
    note: '双凹圆盘，几秒钟看完，适合当引子。',
    query: '?cell=red-blood-cell',
  },
];

/** The 30-second path we would walk someone through, in order. */
export const DEMO_PATH = ['compare', 'practice', 'scale'];
