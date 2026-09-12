# Blender 家具工作流

本目录包含真正由 Blender 4.5.3 LTS 生成的可编辑源文件，不是把 Three.js 图元包装成 `.blend`。

## 文件

- `sunny-furniture.blend`：六件家具的源模型，按 Collection 分类，带可编辑的倒角、加厚、法线修改器和曲线缝线。
- `build_furniture.py`：可重复运行的建模和导出脚本。
- `../../public/models/blender/*.glb`：游戏使用的模型，包含材质，无外部纹理依赖。
- `../../src/assets/blender-manifest.json`：版本、模型哈希、文件大小、三角面数、边界和占地信息。

当前家具批次：沙发、休闲椅、茶几、床、落地灯、植物。其余家具和可编辑房屋由运行时代码生成；人物使用下文单独的蒙皮 GLB。

## 修改与导出

1. 用 Blender 打开 `sunny-furniture.blend`。
2. 修改对应的 `Furniture_<type>` Collection，保留 `Asset_<type>` 父对象。
3. 保存 `.blend`，在项目根目录执行：

```bash
npm run models:export
```

该命令读取现有源文件，只更新 GLB 和清单，不重新生成或保存源文件，因此不会覆盖手工建模的修改。

从脚本重新生成整套源模型：

```bash
npm run models:rebuild
```

注意：`models:rebuild` 会重建 `sunny-furniture.blend`，不保留手工造型修改；重要修改请保存在其他 `.blend` 文件中。Blender 也会按自身备份设置保留 `.blend1`。

项目当前使用的 Blender 可执行文件位于：

```text
.runtime/Blender.app/Contents/MacOS/Blender
```

导出器也会查找 `/Applications/Blender.app` 和 PATH 中的 `blender`，或使用环境变量 `BLENDER_BIN`。玩游戏、运行测试或构建网页不需要安装 Blender。

## 资产约定

- 单位为米。Blender 中 Z 向上、-Y 朝前，导出后 Three.js 中 Y 向上、+Z 朝前。
- 每个 Collection 由 `Asset_<type>` 父对象统一移动。源场景为了查看而排开，导出时自动归零，再恢复位置。
- 所有新增部件放入对应 Collection，并成为该父对象的子对象。
- 模型底部位于地面 0，居中于占地范围，不改变 `src/game.js` 中的家具尺寸和编号。
- `Dye_Main_<type>` 材质随游戏颜色选项改变；`Dye_Seam_<type>` 跟随主色并加深。其他材质保持原色。
- 使用 glTF 支持的 Principled BSDF 基础色、金属度、粗糙度。当前导出不包含 UV、贴图和动画，加入这些内容需同时调整导出与校验规则。
- 导出过程应用临时副本的修改器和变换，按材质合并网格；源模型保持可编辑。
- 每件模型控制在 16,000 个三角面、10 个材质批次、300 KB 以内。建模时保留这些预算。

## 验证

```bash
npm test
npm run test:e2e
npm run build
```

资源校验会解析真实 GLB，检查文件哈希、朝向、地面原点、占地边界、染色材质和面数。浏览器测试检查六个模型实际加载、独立换色、放置旋转、删除撤销、手机画面和单个 GLB 加载失败时的基础模型回退。

## 河谷场景素材

`sunny-world.blend` 是新增的场景素材库，由 `build_world.py` 构建，包含松树、阔叶树、岩石、倒木、彩色楼房、望星塔、木桥、水井、帐篷和小船。每种素材位于 `World_<type>` Collection 下，父对象为 `Asset_<type>`。

```bash
npm run world:export
npm run world:rebuild
```

第一条命令只从已有源文件导出 GLB 和 `src/assets/world-manifest.json`，不会保存或重建源文件。第二条命令会按脚本重建源文件，手工修改前注意区分。

素材保持低多边形棱面和米制尺寸。`Dye_Main_townhouse` 可以在运行时染成珊瑚、薄荷或麦黄色，暖色窗户保留独立材质。导出器在临时网格上应用修改器、合并材质批次和归零变换，源模型保持可编辑。

模型来源是本项目自制。用户提供的四张图片仅作为森林河谷、微缩彩色建筑、低多边形植被和尖顶塔的风格参考，没有把图片当作场景贴图。

实际关卡组装在 `src/world-layout.json` 与 `src/environment.js` 中。修改河岸、高台或桥梁时，应使用共享布局，保持小地图、地面高度和寻路一致；修改桥面造型时需同步 `terrain.js` 中的桥面高度函数。运行游戏只需要导出的 GLB，不需要启动 Blender。

## 可动人物

`sunny-resident.blend` 包含 25 节点骨骼、蒙皮权重、三种服装、四种发型、两种基础面容、眼镜、叉子和八条 NLA 动画轨道。头部、眼睛、眉毛和发型来自 Quaternius CC0 素材，其余为本项目制作或适配。源文件保存全部变体，查看单个造型时可按 `variant` 与 `base` 属性隔离。

```bash
npm run resident:export
npm run resident:rebuild
```

导出命令读取已有源文件；重建命令会覆盖源文件，并读取 `art/vendor/quaternius` 中的原始资产。运行时通过 `SkeletonUtils.clone` 隔离骨骼，`AnimationMixer` 播放 Idle、Walk、SitDown、SitIdle、Eat、StandUp、Talk、Listen，CCDIKSolver 将 `UtensilTip` 对准餐点或 `Mouth` 节点。

关键约定：

- 保留 `Head`、`Hips`、`Eye_L/R`、`Nose`、`UpperArm_L/R`、`Forearm_L/R`、`Hand_L/R`、`Thigh_L/R`、`Shin_L/R`、`Mouth`、`UtensilTip`、`HandTarget` 等骨骼名称。
- `variant` 的 `shirt/jacket/cardigan` 为服装，`hair:short/bob/bun/curly` 为发型；`accessory` 控制眼镜、叉子和食物小块。
- `Resident_*` 材质角色名称用于染色，不要将服装与肤色合并成同一个材质。
- 骨骼校正始终基于当帧动画姿态重新计算，不叠加到上一帧 IK 结果。
- 餐椅接近点、坐点、桌面高度由 `src/interactions.js` 定义；动作阶段与需求恢复统一由 `src/activity-runner.js` 驱动。
- `artist_parts.py` 保留前侧下颌，将原始颈根调整到当前身体比例，再从共享截口顶点延伸连接环到衣领内；低处使用 Chest/Neck 混合权重。不能删除这段连接后只移动头部来隐藏缝隙。
- 衣服肩片连接前后片与袖顶，袖顶使用 Chest/UpperArm 混合权重。角色特写以实际身高确定取景目标。

参考资料与官方视频截帧说明位于 `art/references/character-and-dining.md` 和 `art/references/live-mode-hud.md`。授权原文位于 `art/vendor/quaternius/LICENSE.txt`，改动说明位于同目录 README。没有使用从《模拟人生》提取的专有资源。
