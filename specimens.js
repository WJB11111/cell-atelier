// Specimen catalogue and teaching copy.
//
// Every entry is a seven-element tuple consumed by the viewer:
//   [中文名称, English name, 列表中圆点颜色, 说明, 主要功能, 结构特点, 示意图注]
// `keys` lists the selectable structures in the order they appear in the page;
// each key matches the `organelle` identifier written by the Blender build
// scripts, so no mesh is ever shown without an entry and vice versa.
//
// Scope is visible to learners: anything the model left out is stated in
// `omitted` instead of being silently absent, and wording that is only true for
// one cell type lives in that specimen's `entries` rather than in `baseEntries`.

// Observation modes. A view is either a geometry mode — `cutaway` shows the
// sectioned envelope that ships with the model, `whole` and `transparent`
// cross-fade in the closed envelope from `<id>-shells.glb` — or a camera preset
// for specimens that are not sectioned at all (a biconcave disc has no inside,
// but its profile is only visible from the side).
const cutawayView = { id: 'cutaway', label: '剖面', mode: 'cutaway', note: '教学剖面 · 部分外壳省略' };
const wholeView = { id: 'whole', label: '整体', mode: 'whole', note: '完整外形 · 点选内部结构进入剖面' };
const transparentView = { id: 'transparent', label: '透明', mode: 'transparent', note: '外壳透明示意 · 便于定位内部结构' };
const SECTION_VIEWS = [cutawayView, wholeView, transparentView];
//: the plant cell introduces the closed envelope first, as in the original
const ENVELOPE_FIRST_VIEWS = [wholeView, cutawayView, transparentView];

// Real-world size of each model. `structure` names the part whose world-space
// span stands for `real` micrometres, so the viewer can print a scale bar and a
// learner can see that a cell is far smaller than it feels on screen. `note`
// marks the models that are deliberately not to scale everywhere.
const scaleOf = (structure, real, label, note) => ({ unit: 'µm', structure, real, label, note });

export const specimens = {
  'animal-cell': {
    en: 'Animal Cell',
    zh: '动物细胞',
    sub: '真核生物 · 有核体细胞示意',
    icon: '◉',
    color: '#9865a9',
    description: '一个微小而完整的世界。',
    keys: ['nucleus', 'mitochondria', 'er', 'golgi', 'membrane', 'fibers', 'centrioles', 'vesicles', 'ribosomes'],
    hidden: ['membrane'],
    hideLabel: '隐藏细胞膜',
    camera: [3.6, 6.5, 8.8],
    views: SECTION_VIEWS,
    defaultView: 'cutaway',
    shells: 'animal-cell-shells.glb',
    envelope: ['membrane'],
    //: a typical animal cell is 10-30 µm across; this one is drawn at 20 µm
    size: scaleOf('membrane', 20, '细胞直径 20 µm'),
    omitted: '未展示：溶酶体、过氧化物酶体等。细胞核与细胞膜采用剖切示意，开口不代表真实细胞有缺口；线粒体内部仅示意部分嵴；中心粒为一对近似垂直的短筒。膜厚与颗粒尺寸均经过放大。',
  },

  'plant-cell': {
    en: 'Plant Cell',
    zh: '植物细胞',
    sub: '叶肉细胞示意',
    icon: '▧',
    color: '#748e49',
    description: '绿色的能量工厂，藏在每一片叶子里。',
    keys: ['nucleus', 'chloroplast', 'vacuole', 'wall', 'membrane', 'mitochondria', 'er', 'golgi', 'ribosomes'],
    hidden: ['wall', 'membrane'],
    hideLabel: '隐藏细胞壁与细胞膜',
    camera: [4, 7, 9.5],
    views: ENVELOPE_FIRST_VIEWS,
    defaultView: 'cutaway',
    shells: 'plant-shells.glb',
    envelope: ['wall', 'membrane'],
    //: a mesophyll cell runs 30-100 µm; this one is drawn at 50 µm
    size: scaleOf('wall', 50, '细胞长度 50 µm'),
    omitted: '以成熟叶肉细胞为参考：中央液泡占据较大空间，细胞核与细胞器分布在周围细胞质中。上方剖切用于观察内部，不代表天然开口。未展示过氧化物酶体、胞间连丝等；叶绿体数量与基粒堆叠均经过简化。',
  },

  cyanobacterium: {
    en: 'Cyanobacterium',
    zh: '蓝细菌',
    sub: '原核生物 · 单细胞示意',
    icon: '◒',
    color: '#378b82',
    description: '没有叶绿体，也能进行光合作用。',
    keys: ['nucleoid', 'ribosomes', 'thylakoids', 'membrane', 'wall', 'cytoplasm'],
    hidden: ['membrane'],
    hideLabel: '隐藏细胞膜',
    camera: [3.5, 8, 10],
    views: SECTION_VIEWS,
    defaultView: 'cutaway',
    shells: 'cyanobacterium-shells.glb',
    envelope: ['wall', 'membrane', 'cytoplasm'],
    //: a single cyanobacterial cell is a few micrometres long
    size: scaleOf('wall', 3, '细胞长度 3 µm'),
    omitted: '以具类囊体的单细胞蓝细菌作概括示意。上方剖切用于展示内部，真实细胞并不敞口。蓝细菌没有细胞核、叶绿体和线粒体；未展示羧酶体、储存颗粒等。膜层数、DNA 形态与颗粒数量均经过简化。',
  },

  'white-blood-cell': {
    en: 'White Blood Cell',
    zh: '白细胞',
    sub: '中性粒细胞示意',
    icon: '◌',
    color: '#8b80a5',
    description: '以分叶细胞核为特征的免疫细胞。',
    keys: ['nucleus', 'granules', 'mitochondria', 'membrane'],
    hidden: ['membrane'],
    hideLabel: '隐藏细胞膜',
    camera: [2.5, 7.5, 8.5],
    views: SECTION_VIEWS,
    defaultView: 'cutaway',
    shells: 'white-blood-cell-shells.glb',
    envelope: ['membrane'],
    //: a neutrophil is 10-15 µm across
    size: scaleOf('membrane', 12, '细胞直径 12 µm'),
    omitted: '本标本选用中性粒细胞，不代表所有白细胞：淋巴细胞、单核细胞等的形态差异很大。未展示内质网、高尔基体、核糖体等。胞质颗粒未按类型与真实染色区分，表面突起与细胞轮廓经过简化。',
  },

  neuron: {
    en: 'Neuron',
    zh: '神经元',
    sub: '有髓神经元示意',
    icon: '✳',
    color: '#7899a3',
    description: '沿着分支与轴突，探索信息传递的路径。',
    keys: ['soma', 'nucleus', 'dendrites', 'axon', 'myelin', 'terminals', 'membrane'],
    hidden: ['membrane'],
    hideLabel: '隐藏胞体膜',
    camera: [0, 12, 10],
    views: SECTION_VIEWS,
    defaultView: 'cutaway',
    shells: 'neuron-shells.glb',
    envelope: ['membrane'],
    //: the soma is about 20 µm across; the processes are shortened for the page
    size: scaleOf('soma', 20, '胞体直径 20 µm', '树突与轴突为示意长度，未按真实比例'),
    omitted: '胞体与细胞核采用剖切展示。未展示内质网、高尔基体、线粒体、核糖体，以及形成髓鞘的胶质细胞。真实细胞膜连续包围胞体、树突和轴突，本模型仅将胞体膜单独分组；髓鞘节间为示意，树突分支数量与形态经过简化。',
  },

  'red-blood-cell': {
    en: 'Red Blood Cell',
    zh: '成熟红细胞',
    sub: '哺乳动物 · 人红细胞示意',
    icon: '◎',
    color: '#b8504f',
    description: '中央薄、周缘厚的双凹圆盘，为运输氧气而特化。',
    keys: ['membrane', 'rbc_cytoplasm'],
    hidden: ['membrane'],
    hideLabel: '隐藏细胞膜',
    revealOnSelect: ['rbc_cytoplasm'],
    camera: [3.4, 7, 9.2],
    // No section here: the disc is closed, and its shape only reads from two
    // angles, so the views are camera presets rather than cutaway modes.
    views: [
      { id: 'face', label: '正面', camera: [0.6, 9.4, 2.8], note: '俯视圆盘 · 中央凹陷' },
      { id: 'edge', label: '侧面', camera: [0, 1.5, 9.4], note: '侧视剖面 · 双凹轮廓' },
    ],
    defaultView: 'face',
    //: a human red blood cell is about 7.5 µm across and 2 µm thick
    size: scaleOf('membrane', 7.5, '细胞直径 7.5 µm'),
    omitted: '人类成熟红细胞没有细胞核、线粒体和核糖体，这些不是模型遗漏。双面中央凹陷但不穿孔。未单独展示膜骨架、膜蛋白与血红蛋白分子；不代表所有动物的红细胞。',
  },

  'sperm-cell': {
    en: 'Sperm Cell',
    zh: '精子细胞',
    sub: '人类精子 · 结构示意',
    icon: '◁',
    color: '#6f8f9d',
    description: '高度特化的生殖细胞：头部携带遗传信息，中段富集线粒体，长尾参与运动。',
    keys: ['acrosome', 'nucleus', 'mitochondria', 'flagellum'],
    hidden: [],
    camera: [0, 10.5, 13.5],
    // The whole cell is 9 units long, so the head and the midpiece need their
    // own camera presets to be more than a few pixels on screen.
    views: [
      { id: 'overview', label: '整体', camera: [0, 10.5, 13.5], note: '全长概览 · 头部与尾部' },
      { id: 'head', label: '头部', camera: [-0.9, 2.9, 3.9], target: [-3.6, 0, 0], note: '顶体帽与浓缩细胞核' },
      { id: 'midpiece', label: '中段', camera: [0.4, 3.0, 4.2], target: [-2.25, 0, 0], note: '螺旋排列的线粒体鞘' },
    ],
    defaultView: 'overview',
    //: the head is 4-5 µm long; the real tail is about ten times the head, so
    //: this model shortens it to keep the whole cell on screen
    size: scaleOf('nucleus', 4.5, '头部长度 4.5 µm', '尾部为示意长度，未按真实比例'),
    omitted: '细胞膜实际上连续包围头部、中段和尾部，本模型没有把它拆成独立可选层。未展示轴丝“9+2”结构、外致密纤维等超微结构；形态按人类精子概括，不代表所有物种。',
  },
};

// Entries shared by every specimen that shows the structure. Wording here must
// stay true for all of them: the animal cell has no chloroplast, the plant cell
// has no centriole, the cyanobacterium has neither.
export const baseEntries = {
  nucleus: ['细胞核', 'Nucleus', '#85519f',
    '细胞的遗传信息中心。核膜把染色质与细胞质分开，核内的核仁参与核糖体的形成。',
    '储存 DNA，调控基因表达',
    '双层核膜包围，内部含染色质与核仁',
    '紫色壳体为剖切后的核膜，深紫色小球是核仁的示意；核孔与染色质没有按真实尺度展开。'],
  mitochondria: ['线粒体', 'Mitochondrion', '#c96a4e',
    '细胞进行有氧呼吸的主要场所。内膜向内折叠形成嵴，为与能量转换有关的反应提供更大的膜面积。',
    '通过有氧呼吸参与 ATP 的合成',
    '双层膜，内膜向内折叠形成嵴',
    '珊瑚色外壳内部，浅粉色片层表示内膜折叠形成的嵴；嵴的数量与形态经过简化。'],
  er: ['内质网', 'Endoplasmic reticulum', '#8b69a6',
    '与核膜相连的膜性管道和囊腔系统。附着核糖体的部分为粗面内质网，另有光面内质网。',
    '合成、加工并运输蛋白质与脂质',
    '相互连通的膜囊与管道，与核膜相连',
    '紫色片层示意粗面内质网，其上的浅色颗粒为核糖体；粉色分支管道表示光面内质网。'],
  golgi: ['高尔基体', 'Golgi apparatus', '#c87e96',
    '由层叠的扁平膜囊组成，接收内质网送来的物质，进一步修饰、分类并包装后运出。',
    '加工、分拣和运输蛋白质等物质',
    '层叠的扁平膜囊及其周围的囊泡',
    '粉色层叠膜囊为高尔基体，旁边的小球表示由它形成的运输囊泡，二者名称不同。'],
  membrane: ['细胞膜', 'Cell membrane', '#a996c6',
    '细胞与外界环境之间的选择性边界，参与物质运输、细胞识别与信息交流。',
    '选择性地控制物质进出细胞',
    '以磷脂双分子层为基本骨架',
    '当前为剖切展示，开口只用于观察内部；点击“隐藏细胞膜”可完全移除外层。'],
  ribosomes: ['核糖体', 'Ribosome', '#b092c2',
    '由 RNA 和蛋白质组成的无膜结构，是按照 mRNA 的信息合成蛋白质的场所。',
    '合成蛋白质',
    '无膜包围，由大小两个亚基组成',
    '浅紫色小颗粒分布在内质网表面与细胞质中；数量与大小都不按真实比例。'],
  vesicles: ['囊泡', 'Vesicle', '#d4b15d',
    '由膜围成的小型囊状结构，在细胞内运输、储存和加工多种物质。',
    '胞内物质的运输与储存',
    '单层膜围成的小囊',
    '金色小球表示分布在细胞质中的囊泡，不代表某一种特定囊泡。'],
  fibers: ['细胞骨架', 'Cytoskeleton', '#7fa3b0',
    '贯穿细胞质的蛋白质纤维网络，帮助细胞维持形态，并参与运动与胞内运输。',
    '支撑细胞形态，参与运动与物质运输',
    '由微丝、微管和中间纤维等多类纤维构成',
    '浅蓝色细线是简化表达；真实的细胞骨架由多种直径不同的纤维组成。'],
  centrioles: ['中心粒', 'Centriole', '#c39b45',
    '由微管构成的短筒状结构，动物细胞中通常成对出现，参与微管的组织。',
    '参与微管组织，与细胞分裂有关',
    '九组微管围成筒状',
    '金色筒状结构为一对近似垂直的中心粒；微管的三联体结构未逐层建模。'],
  chloroplast: ['叶绿体', 'Chloroplast', '#608443',
    '绿色植物进行光合作用的细胞器。内部的类囊体堆叠成基粒，基粒之间由基质片层连接。',
    '进行光合作用，把光能转化为化学能',
    '双层膜包被，内含基粒与基质',
    '深浅两层绿色壳体表示被膜剖面，黄绿色圆片堆叠为基粒，细连接表示基质片层；膜厚与数量均已简化。'],
  vacuole: ['中央液泡', 'Central vacuole', '#64a8b0',
    '成熟植物细胞中常见的大型膜性结构，内部含细胞液，可储存物质并维持细胞的膨压。',
    '储存物质，维持细胞膨压',
    '由液泡膜包围，占据细胞中央较大空间',
    '蓝绿色大囊体表示液泡，其形态与比例经过艺术化简化；液泡膜未单独分组。'],
  wall: ['细胞壁', 'Cell wall', '#7c934d',
    '位于细胞膜外侧，主要成分是纤维素等多糖，为植物细胞提供支持与保护。',
    '支持和保护细胞',
    '有一定的厚度，与细胞膜是两层不同的结构',
    '外侧连续的绿色壁层为细胞壁，里面更薄的浅绿色层是细胞膜；表面的细微起伏为艺术化纹理。'],
};

// Structures that only one specimen has. Keys are unique across the project,
// so a single table is enough.
export const extraEntries = {
  nucleolus: ['核仁', 'Nucleolus', '#633d78',
    '细胞核内的致密区域，与核糖体 RNA 的合成以及核糖体亚基的组装有关。',
    '参与核糖体的形成',
    '位于细胞核内部，没有膜包围',
    '深紫色小球表示核仁，与核膜不是同一结构；点击它会显示细胞核的笔记。'],

  // cyanobacterium
  nucleoid: ['拟核（DNA 集中区域）', 'Nucleoid', '#c39855',
    '蓝细菌的遗传物质主要集中在拟核区域。拟核没有核膜包围，因此不是细胞核。',
    '储存和传递遗传信息',
    '无核膜包围的 DNA 集中区域',
    '金色曲线示意 DNA 的折叠分布，不代表染色体的真实形状、长度或拷贝数；蓝细菌通常还有质粒。'],
  thylakoids: ['类囊体', 'Thylakoids', '#378b82',
    '蓝细菌的光合膜系统，光合色素与相关反应体系就分布在这些膜上。它们直接位于细胞质中，不被叶绿体包裹。',
    '进行光合作用的光反应',
    '细胞内层叠分布的光合膜系统',
    '层层嵌套的青绿色片层表示类囊体膜，膜上的浅色小颗粒示意藻胆体等捕光复合体；膜厚与层数经过放大。不同蓝细菌的膜排列差异很大。'],
  cytoplasm: ['细胞质', 'Cytoplasm', '#9dc3bb',
    '细胞膜内部的细胞质包含核糖体、DNA 以及多种与代谢有关的物质，是各种反应的场所。',
    '提供代谢反应的环境',
    '不含细胞核、线粒体或叶绿体',
    '浅青绿色底层表示被剖开的细胞内部空间，并不是额外的一层膜。'],

  // neutrophil
  granules: ['胞质颗粒', 'Cytoplasmic granules', '#b3619c',
    '中性粒细胞内的膜包裹颗粒，含有参与抗微生物防御的多种成分。',
    '参与抗微生物防御',
    '具有不同类型的颗粒，本图未区分',
    '粉紫色小颗粒采用统一颜色与简化尺寸，不对应真实染色与数量。'],

  // neuron
  soma: ['胞体', 'Soma', '#a897bf',
    '神经元含细胞核及多种细胞器的主体部分，不等同于细胞膜。',
    '维持细胞代谢，参与信号整合',
    '含细胞质、细胞核及多种细胞器',
    '浅紫色开放壳体示意剖切后的胞体内部；并非完整细胞器清单。'],
  dendrites: ['树突', 'Dendrites', '#9b79ad',
    '从神经元胞体伸出的分支结构，通常参与接收其他细胞传来的信号。',
    '接收并整合输入信号',
    '多级分支的突起',
    '紫色树状分支表现树突的空间分布，不是某一特定神经元的精确重建；树突棘未逐一建模。'],
  axon: ['轴突', 'Axon', '#bc809f',
    '从胞体伸出的较长突起，把神经冲动传向远端。',
    '传导动作电位',
    '细长突起，可被髓鞘包裹',
    '粉色轴线贯穿各段髓鞘，可单独查看其连续结构。'],
  myelin: ['髓鞘', 'Myelin sheath', '#7fa9ad',
    '围绕部分轴突的多层膜结构，由胶质细胞形成，可提高神经冲动传导的效率。',
    '提高神经冲动传导效率',
    '分节包裹轴突，节间留有间隙',
    '浅青色分段外套为髓鞘示意，段间空隙对应郎飞结所在区域；形成髓鞘的胶质细胞未绘出。'],
  terminals: ['轴突末梢', 'Axon terminals', '#a777b1',
    '轴突远端的分支及终末结构，可通过突触与其他细胞通信。',
    '向其他细胞传递信号',
    '末端分支及突触终末',
    '右侧带小球的紫色分支表现轴突终末，小球示意突触前部；突触间隙与突触后膜未建模。'],

  // red blood cell
  rbc_cytoplasm: ['细胞质（含血红蛋白）', 'Haemoglobin-rich cytoplasm', '#db8070',
    '成熟红细胞的细胞质富含血红蛋白。血红蛋白能与氧可逆结合，参与氧气运输；细胞主要通过糖酵解获得 ATP。',
    '携带氧气，维持细胞代谢',
    '富含可溶性血红蛋白，没有细胞核和线粒体',
    '已自动隐藏外层细胞膜。浅红色实体表示细胞质所占空间，并不是额外的一层膜；血红蛋白不是细胞器，未用放大的颗粒冒充其真实分布。'],

  // sperm cell
  acrosome: ['顶体', 'Acrosome', '#d9878f',
    '位于精子头部前端的帽状结构，由高尔基体相关囊泡发育形成，含有参与受精过程的多种蛋白质。',
    '参与精卵识别与受精过程',
    '覆盖精子头部前端的帽状囊性结构',
    '珊瑚粉色前帽为顶体的形态示意，比例经过放大以便观察。'],
  flagellum: ['鞭毛（尾部）', 'Flagellum', '#6f9eaa',
    '从精子中段向后延伸的细长运动结构，内部轴丝由微管系统构成。',
    '产生推进运动',
    '细长尾部，内部含典型轴丝结构',
    '蓝绿色细长曲线表示鞭毛整体；内部微管、纤维鞘等超微结构未逐层建模，摆动形态为静态示意。'],
};

// Wording that must differ from the shared entry for one specimen.
const overrides = {
  'plant-cell': {
    nucleus: ['细胞核', 'Nucleus', '#85519f',
      '叶肉细胞的遗传信息中心，通常被中央液泡挤到细胞边缘。',
      '储存 DNA，调控基因表达',
      '双层核膜包围，内部含染色质与核仁',
      '紫色壳体为剖切后的核膜，深紫色小球表示核仁；液泡一侧的细胞质较薄。'],
    chloroplast: ['叶绿体', 'Chloroplast', '#608443',
      '叶肉细胞中进行光合作用的细胞器，内部类囊体堆叠成基粒，是光反应进行的场所。',
      '进行光合作用',
      '双层膜包被，内部有基粒与基质片层',
      '绿色椭球被剖开，里面黄绿色圆片堆叠表示基粒，浅绿色层表示叶绿体内部基质；数量与堆叠层数均已简化。'],
    vacuole: ['中央液泡', 'Central vacuole', '#64a8b0',
      '成熟叶肉细胞中最显眼的结构，可占细胞体积的大部分，内含细胞液。',
      '储存物质，维持细胞膨压',
      '由液泡膜包围，占据细胞中央',
      '蓝绿色大囊体位于细胞中央，因此其他细胞器分布在周围；内部为示意，未展示细胞液成分。'],
    wall: ['细胞壁', 'Cell wall', '#7c934d',
      '位于细胞膜外侧，主要含纤维素等多糖，为植物细胞提供支持，并参与细胞形态的维持。',
      '支持和保护细胞，维持细胞形态',
      '较厚的外层结构，与细胞膜相邻但成分不同',
      '最外层的绿色厚壁是细胞壁，紧贴其内的浅绿色薄层是细胞膜；两层在“整体”视图中同时显示。'],
    membrane: ['细胞膜', 'Plasma membrane', '#a6c4a0',
      '紧贴细胞壁内侧，控制物质进出细胞，也是细胞与外界交流的界面。',
      '选择性地控制物质进出细胞',
      '以磷脂双分子层为基本骨架，位于细胞壁内侧',
      '浅绿色内层表示细胞膜，隐藏在细胞壁内侧；切换到“整体”视图可看到两层外壳。'],
    golgi: ['高尔基体', 'Golgi apparatus', '#c87e96',
      '植物细胞同样具有高尔基体，除加工和运输蛋白质外，还参与某些细胞壁多糖的合成。',
      '加工与运输物质，参与细胞壁成分的合成',
      '层叠的扁平膜囊及周围囊泡',
      '粉色层叠膜囊位于细胞核附近，周围小球为囊泡示意。'],
  },

  cyanobacterium: {
    wall: ['细胞壁与外膜', 'Cell envelope', '#5d8f89',
      '蓝细菌细胞壁含肽聚糖，外侧还有外膜；这与植物以纤维素为主的细胞壁成分不同。',
      '支持和保护细胞',
      '含肽聚糖的细胞壁，外侧有外膜',
      '深青色外壳合并表示细胞壁与外膜，两者未逐层拆分；不代表只有一层膜。'],
    membrane: ['细胞膜', 'Plasma membrane', '#a6c4a0',
      '细胞膜位于细胞壁内侧、包围细胞质。蓝细菌有细胞膜，但没有包围遗传物质的核膜。',
      '控制物质进出，维持细胞内环境',
      '主要由脂质和蛋白质构成',
      '浅绿色内层表示细胞膜；隐藏此层不会隐藏细胞壁，也不会隐藏内部的类囊体膜。'],
  },

  'white-blood-cell': {
    nucleus: ['分叶细胞核', 'Lobed nucleus', '#85519f',
      '中性粒细胞的细胞核分成数叶，叶间由细窄部分相连，是辨认这类细胞的重要特征。',
      '储存 DNA，调控基因表达',
      '分成 2～5 叶，各叶由细丝相连',
      '紫色叶状结构为分叶核示意，叶数固定为三叶；未展示染色质与核仁细节。'],
  },

  'red-blood-cell': {
    membrane: ['细胞膜', 'Cell membrane', '#b8504f',
      '红细胞的选择性边界，与膜骨架共同帮助细胞维持形态并发生形变。',
      '控制物质进出，维持可变形的细胞边界',
      '以磷脂双分子层为基础，膜下有骨架支持',
      '外表面呈双凹圆盘形，两面中央都较薄，但没有孔洞。膜厚不按真实比例；膜骨架未单独建模。'],
  },

  'sperm-cell': {
    nucleus: ['细胞核', 'Nucleus', '#755894',
      '精子头部的大部分空间由高度浓缩的单倍体细胞核占据，携带父方的遗传信息。',
      '携带单倍体遗传信息',
      '染色质高度浓缩，位于头部主体',
      '紫色椭球表示高度浓缩的细胞核；没有按真实染色质尺度展开，也没有展示核膜细节。'],
    mitochondria: ['线粒体鞘', 'Mitochondrial sheath', '#ce7b4e',
      '线粒体集中分布在精子中段，围绕鞭毛轴形成线粒体鞘，为运动提供能量。',
      '参与供能，支持精子运动',
      '在中段围绕轴丝螺旋排列',
      '橙色小体沿中段呈螺旋式分布示意；数量、圈数与尺寸均经过简化。'],
  },
};

for (const [id, entries] of Object.entries(overrides)) {
  specimens[id].entries = { ...(specimens[id].entries ?? {}), ...entries };
}

// Resolve the wording for a structure without touching the shared table.
export function structureEntry(cellId, key, base) {
  return specimens[cellId]?.entries?.[key] ?? extraEntries[key] ?? base[key];
}

// Selecting a structure may reveal the membrane it sits behind.
export function membraneHiddenAfterSelection(cellId, key, wasHidden) {
  const cell = specimens[cellId];
  if (cell.hidden.includes(key)) return false;
  return cell.revealOnSelect?.includes(key) ? true : wasHidden;
}

export const catalogueOrder = Object.keys(specimens);
