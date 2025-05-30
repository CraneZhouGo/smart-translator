 # Smart Translator 隐私权政策

## 单一用途说明
Smart Translator 是一个专注于英文到中文翻译的浏览器扩展，其单一核心功能是为用户提供即时的英文文本翻译服务。用户只需选中网页上的英文文本，扩展程序就会自动显示对应的中文翻译。

## 权限使用说明

### 主机权限 (`host_permissions: ["*://*/*"]`)
- **使用目的**：允许扩展在所有网页上运行，以便用户可以在任何网站上使用翻译功能
- **使用方式**：仅在用户选中文本时激活，不会主动访问或修改网页内容
- **必要性说明**：为了提供无缝的翻译体验，需要在所有网页上运行内容脚本

### 存储权限 (`storage`)
- **使用目的**：用于存储翻译缓存和用户偏好设置
- **使用方式**：
  - 保存最近使用的翻译结果，提高翻译速度
  - 存储用户的暗黑模式偏好
- **必要性说明**：通过本地缓存减少重复翻译请求，提升用户体验

### 远程代码说明
本扩展使用的远程服务仅限于：
- 访问翻译 API 以获取翻译结果
- 不会下载或执行任何远程代码
- 所有功能代码都包含在扩展包中

## 数据收集和使用

### 收集的数据
- 用户选中的文本：仅用于实时翻译
- 翻译结果：临时存储在本地缓存中
- 界面偏好：如暗黑模式设置

### 数据使用方式
- 所有数据仅存储在用户本地
- 不会上传或分享任何用户数据
- 翻译缓存定期自动清理
- 不会追踪用户的浏览历史或个人信息

### 数据保护
- 所有数据均存储在浏览器的安全存储区域
- 不与任何第三方共享数据
- 用户可随时清除扩展存储的所有数据

## 开发者承诺
我们承诺：
1. 遵守 Chrome Web Store 开发者计划政策
2. 保护用户隐私和数据安全
3. 及时响应用户反馈和问题
4. 定期更新维护扩展功能

## 联系方式
如有任何问题或疑虑，请通过以下方式联系我们：
- 电子邮件：[您的邮箱地址]
- GitHub Issues：[您的GitHub仓库地址]

## 政策更新
本隐私权政策可能会随着扩展功能的更新而更新。我们会在此页面发布更新的版本，并在重大变更时通知用户。

最后更新日期：2025年[05]