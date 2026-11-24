import { LevelDefinition } from '../types/game';

export const LEVELS: LevelDefinition[] = [
  // ==========================================
  // 第一章：入门教学 (Chapter 1: Tutorial & Basics)
  // 目标：推箱步数 4 ~ 12 步，熟悉基础规则与操作
  // ==========================================
  {
    id: 1,
    chapter: 1,
    chapterTitle: '第一章：入门教学',
    title: '启程之径',
    difficulty: 'Easy',
    description: '基础直行推箱：熟悉推箱规则，将两只箱子推入对应目标点。',
    parSteps: 8,
    xsb: `
#######
#@ $ .#
#  $ .#
#######
    `.trim(),
  },
  {
    id: 2,
    chapter: 1,
    chapterTitle: '第一章：入门教学',
    title: '转角相遇',
    difficulty: 'Easy',
    description: '拐角腾挪：学会绕过障碍物，从侧面将箱子推入终点。',
    parSteps: 21,
    xsb: `
######
#@   #
# $# #
# $  #
#  ..#
######
    `.trim(),
  },
  {
    id: 3,
    chapter: 1,
    chapterTitle: '第一章：入门教学',
    title: '直道三连',
    difficulty: 'Easy',
    description: '顺序先后：三个箱子排布，注意不要堵死走道通道。',
    parSteps: 29,
    xsb: `
########
#@     #
# $$$  #
#  ... #
########
    `.trim(),
  },
  {
    id: 4,
    chapter: 1,
    chapterTitle: '第一章：入门教学',
    title: '双翼展翅',
    difficulty: 'Easy',
    description: '双向分流：分工合作，左右两侧分别推进。',
    parSteps: 18,
    xsb: `
######
#@   #
# $$ #
#  $ #
#... #
######
    `.trim(),
  },
  {
    id: 5,
    chapter: 1,
    chapterTitle: '第一章：入门教学',
    title: '环廊初识',
    difficulty: 'Easy',
    description: '闭环回廊：利用中岛绕行，从不同方位推动箱子。',
    parSteps: 31,
    xsb: `
######
#    #
# $# #
# $  #
#@$..#
#   .#
######
    `.trim(),
  },

  // ==========================================
  // 第二章：巧思进阶 (Chapter 2: Tactical Maneuvers)
  // 目标：推箱步数 >= 10 步，搜索状态数 >= 25
  // ==========================================
  {
    id: 6,
    chapter: 2,
    chapterTitle: '第二章：巧思进阶',
    title: '十字枢纽',
    difficulty: 'Medium',
    description: '十字调度：四方连通，先将外围箱子推向避让槽才能打通主干道。',
    parSteps: 42,
    xsb: `
#######
#  .  #
# $#$ #
#     #
# $#$ #
#  .  #
# .@. #
#######
    `.trim(),
  },
  {
    id: 7,
    chapter: 2,
    chapterTitle: '第二章：巧思进阶',
    title: '顺逆回环',
    difficulty: 'Medium',
    description: '环形错位：四只箱子封锁通道，需沿对角线依次调换位置。',
    parSteps: 36,
    xsb: `
#######
#  .  #
# $#$ #
# .@. #
# $#$ #
#  .  #
#######
    `.trim(),
  },
  {
    id: 8,
    chapter: 2,
    chapterTitle: '第二章：巧思进阶',
    title: '四角方阵',
    difficulty: 'Medium',
    description: '空间调度：四个箱子坐镇中央，需依次清理出口通道。',
    parSteps: 34,
    xsb: `
#######
#..#..#
#  $  #
# $$@ #
#  $  #
#  #  #
#######
    `.trim(),
  },
  {
    id: 9,
    chapter: 2,
    chapterTitle: '第二章：巧思进阶',
    title: '避让回廊',
    difficulty: 'Medium',
    description: '进退借位：双中岛环廊，利用中空结构完成四箱避让调配。',
    parSteps: 92,
    xsb: `
########
#  ..  #
# $##$ #
#  $   #
# $##$ #
#  .   #
# .@.  #
########
    `.trim(),
  },
  {
    id: 10,
    chapter: 2,
    chapterTitle: '第二章：巧思进阶',
    title: '中央庭院',
    difficulty: 'Medium',
    description: '庭院清障：五箱紧凑阵列，精巧的先后顺序决定能否完成清场。',
    parSteps: 81,
    xsb: `
#######
# ... #
# $#$ #
#  $  #
# $#$ #
#  .  #
#  @. #
#######
    `.trim(),
  },

  // ==========================================
  // 第三章：空间腾挪 (Chapter 3: Spatial Shuffling)
  // 目标：推箱步数 >= 16 步，搜索状态数 >= 80
  // ==========================================
  {
    id: 11,
    chapter: 3,
    chapterTitle: '第三章：空间腾挪',
    title: '借位之道',
    difficulty: 'Hard',
    description: '精巧借位：利用中央纵向隔断与上下回廊完成深层避让调换。',
    parSteps: 90,
    xsb: `
########
#  ..  #
#  ##  #
#  $   #
# $#$  #
#  @   #
#  .   #
########
    `.trim(),
  },
  {
    id: 12,
    chapter: 3,
    chapterTitle: '第三章：空间腾挪',
    title: '双子走廊',
    difficulty: 'Hard',
    description: '平行错落：四只箱子错落分布，精准借位防止触发不可逆死锁。',
    parSteps: 70,
    xsb: `
########
#  ..  #
# $##$ #
#  #   #
# $##$ #
#  ..@ #
########
    `.trim(),
  },
  {
    id: 13,
    chapter: 3,
    chapterTitle: '第三章：空间腾挪',
    title: '阶梯错落',
    difficulty: 'Hard',
    description: '错层腾挪：阶梯形墙壁让每一步移动都充满限制，走法极深。',
    parSteps: 65,
    xsb: `
#######
#@  ..#
# $ ..#
# #$$ #
#  $  #
#     #
#######
    `.trim(),
  },
  {
    id: 14,
    chapter: 3,
    chapterTitle: '第三章：空间腾挪',
    title: '风车之环',
    difficulty: 'Hard',
    description: '风车回旋：单向窄道环廊，利用角落唯一的缓冲格逐个过关。',
    parSteps: 82,
    xsb: `
#######
#@ #..#
# $#..#
#  $  #
#  $  #
#  $  #
#     #
#######
    `.trim(),
  },
  {
    id: 15,
    chapter: 3,
    chapterTitle: '第三章：空间腾挪',
    title: '穿针引线',
    difficulty: 'Hard',
    description: '瓶颈穿越：五箱连环推运，空间极其逼仄，容错率为零。',
    parSteps: 133,
    xsb: `
########
#  ... #
# $##$ #
#  $   #
# $##$ #
#  @.. #
########
    `.trim(),
  },

  // ==========================================
  // 第四章：大师试炼 (Chapter 4: Master Trials)
  // 目标：推箱步数 >= 22 步，搜索状态数 >= 250
  // ==========================================
  {
    id: 16,
    chapter: 4,
    chapterTitle: '第四章：大师试炼',
    title: '乾坤挪移',
    difficulty: 'Master',
    description: '深层置换：五箱双向大回环，需进行高达 26 次推箱计算。',
    parSteps: 130,
    xsb: `
#######
#  .  #
# $#$ #
#  $  #
# $#$ #
#  .  #
#  @  #
# ... #
#######
    `.trim(),
  },
  {
    id: 17,
    chapter: 4,
    chapterTitle: '第四章：大师试炼',
    title: '锁钥迷宫',
    difficulty: 'Master',
    description: '交错互锁：经典窄道互锁结构，必须多次回旋才能逐个解锁。',
    parSteps: 145,
    xsb: `
#######
#@ .. #
#  ## #
# $   #
# $#$ #
#  .  #
#  $  #
#  .  #
#######
    `.trim(),
  },
  {
    id: 18,
    chapter: 4,
    chapterTitle: '第四章：大师试炼',
    title: '连环扣',
    difficulty: 'Master',
    description: '双环连动：下沉式目标区与中岛并存，探索深度达近 5000 状态。',
    parSteps: 154,
    xsb: `
#######
#  .  #
# $#$ #
#  $  #
# $#$ #
# . . #
#  @  #
#  .. #
#######
    `.trim(),
  },
  {
    id: 19,
    chapter: 4,
    chapterTitle: '第四章：大师试炼',
    title: '九宫残局',
    difficulty: 'Master',
    description: '方寸乾坤：高密度空间内的极限调度，微型谜题的巅峰作之一。',
    parSteps: 143,
    xsb: `
#######
#  .  #
# $#$ #
#  $  #
# $#$ #
#  .  #
#  .  #
# .@. #
#######
    `.trim(),
  },
  {
    id: 20,
    chapter: 4,
    chapterTitle: '第四章：大师试炼',
    title: '圆融归一',
    difficulty: 'Master',
    description: '内外兼修：顶底双向贯通，要求对每一步推箱落点具备绝对预判。',
    parSteps: 142,
    xsb: `
#######
#  .@ #
# $#$ #
#  $  #
# $#$ #
#  .  #
#  .  #
# . . #
#######
    `.trim(),
  },

  // ==========================================
  // 第五章：经典挑战 (Chapter 5: Legendary Classic)
  // 目标：推箱步数 >= 28 步，搜索状态数 >= 600，单关求解耗时 <= 3500ms
  // ==========================================
  {
    id: 21,
    chapter: 5,
    chapterTitle: '经典挑战',
    title: '微型仓储',
    difficulty: 'Legend',
    description: '传世微型仓：7×8 黄金紧凑格局，精妙绝伦的 28 步推箱博弈。',
    parSteps: 156,
    xsb: `
#######
#  .  #
# $#$ #
#  $  #
# $#$ #
#  .  #
# .@. #
#  .  #
#######
    `.trim(),
  },
  {
    id: 22,
    chapter: 5,
    chapterTitle: '经典挑战',
    title: '巨石阵列',
    difficulty: 'Legend',
    description: '高空开局：小人置身顶端，需全盘重新规划推进动线。',
    parSteps: 156,
    xsb: `
#######
#  .@ #
# $#$ #
#  $  #
# $#$ #
#  .  #
# . . #
#  .  #
#######
    `.trim(),
  },
  {
    id: 23,
    chapter: 5,
    chapterTitle: '经典挑战',
    title: '宗师之门',
    difficulty: 'Legend',
    description: '双门守望：9×9 严苛对称大回廊，状态搜索空间逾 6000 节点。',
    parSteps: 140,
    xsb: `
#########
#  ...  #
# $# #$ #
#  $ $  #
# $# #$ #
#@ ...  #
#########
    `.trim(),
  },
  {
    id: 24,
    chapter: 5,
    chapterTitle: '经典挑战',
    title: '终极博弈',
    difficulty: 'Legend',
    description: '双重回环：经典双回廊阻断，需连续完成 32 次高强度精妙推箱。',
    parSteps: 164,
    xsb: `
########
#  ..  #
#  ##  #
#  $   #
# $#$  #
#  $   #
#  ..  #
#  @   #
########
    `.trim(),
  },
  {
    id: 25,
    chapter: 5,
    chapterTitle: '经典挑战',
    title: '创世殿堂',
    difficulty: 'Legend',
    description: '终局圣殿：完整闭合 8×8 迷宫，深度达 62 步推箱、8500 探索状态的史诗残局！',
    parSteps: 324,
    xsb: `
########
#  .   #
# $#$  #
#  $   #
# $#$  #
#  .   #
# .@.  #
#  .   #
########
    `.trim(),
  },
];
