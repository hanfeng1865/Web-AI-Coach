Add-Type -AssemblyName System.Drawing

# 1. 生成 1280x800 商店截图 (Screenshot)
$w = 1280; $h = 800
$bmp = New-Object System.Drawing.Bitmap($w, $h)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias

# 背景：米白色
$g.Clear([System.Drawing.Color]::FromArgb(255, 248, 246, 241))

# 顶部：深绿色装饰色块
$brushTeal = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 0, 77, 64))
$g.FillRectangle($brushTeal, 0, 0, $w, 240)

# 图标
$iconPath = "d:\AI\codex\AI coach\assets\icon.png"
if (Test-Path $iconPath) {
    $icon = [System.Drawing.Image]::FromFile($iconPath)
    $g.DrawImage($icon, [int]($w/2 - 64), 176, 128, 128)
}

# 字体和排�?$fontTitle = New-Object System.Drawing.Font("Microsoft YaHei", 58, [System.Drawing.FontStyle]::Bold)
$fontSub = New-Object System.Drawing.Font("Microsoft YaHei", 28, [System.Drawing.FontStyle]::Regular)
$brushDark = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 32, 49, 44))

$fmt = New-Object System.Drawing.StringFormat
$fmt.Alignment = [System.Drawing.StringAlignment]::Center

$g.DrawString("页面 AI 教练", $fontTitle, $brushDark, [float]($w/2), [float]380, $fmt)
$g.DrawString("任意网页一键唤出，用中文指出下一步怎么�?, $fontSub, $brushDark, [float]($w/2), [float]510, $fmt)

$bmp.Save("d:\AI\codex\AI coach\assets\screenshot_1280x800.jpg", [System.Drawing.Imaging.ImageFormat]::Jpeg)
$g.Dispose(); $bmp.Dispose()

# 2. 生成 440x280 商店宣传�?(Promo tile / 必需)
$w2 = 440; $h2 = 280
$bmp2 = New-Object System.Drawing.Bitmap($w2, $h2)
$g2 = [System.Drawing.Graphics]::FromImage($bmp2)
$g2.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias

# 背景：深绿色
$g2.Clear([System.Drawing.Color]::FromArgb(255, 0, 77, 64))
$brushLight = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 248, 246, 241))

if (Test-Path $iconPath) {
    $g2.DrawImage($icon, [int]($w2/2 - 32), 40, 64, 64)
}

$fontPromo1 = New-Object System.Drawing.Font("Microsoft YaHei", 24, [System.Drawing.FontStyle]::Bold)
$fontPromo2 = New-Object System.Drawing.Font("Microsoft YaHei", 12, [System.Drawing.FontStyle]::Regular)

$g2.DrawString("页面 AI 教练", $fontPromo1, $brushLight, [float]($w2/2), [float]130, $fmt)
$g2.DrawString("你的网页专属 AI 助手", $fontPromo2, $brushLight, [float]($w2/2), [float]190, $fmt)

$bmp2.Save("d:\AI\codex\AI coach\assets\promo_440x280.jpg", [System.Drawing.Imaging.ImageFormat]::Jpeg)

$g2.Dispose(); $bmp2.Dispose()

# 资源释放
if (Test-Path $iconPath) { $icon.Dispose() }
$brushTeal.Dispose(); $brushDark.Dispose(); $brushLight.Dispose()
$fontTitle.Dispose(); $fontSub.Dispose(); $fontPromo1.Dispose(); $fontPromo2.Dispose()
$fmt.Dispose()

Write-Host "Done"

