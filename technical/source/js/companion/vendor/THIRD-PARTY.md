# 自托管运行依赖

仅向浏览器提供本目录的本地副本，不在运行时回退到第三方 CDN。

| 文件 | 来源/版本 | 许可 |
| --- | --- | --- |
| pixi.min.js | npm pixi.js 6.5.10 | MIT；文件内保留原版权说明 |
| cubism4.min.js | npm pixi-live2d-display 0.4.0 | MIT；文件内保留原版权说明 |
| live2dcubismcore.min.js | Live2D 官方 hosting Core，2026-10-08 下载 | Live2D 专有软件许可；此文件头标记为 Redistributable Code |

来源 URL、字节数、SHA-256 见 sources.json。Core 的固定文件哈希用于本次构建；未来更新需要重新验收兼容性。

Live2D Core 条款：https://www.live2d.com/eula/live2d-proprietary-software-license-agreement_en.html

本目录的许可说明不为模型或声音授予授权；模型另见 /assets/companion/whale/v1/licenses/。
