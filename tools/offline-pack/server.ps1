# A tiny static server for the offline pack, using only what Windows ships with.
#
# The site cannot be opened by double-clicking index.html: it is an ES module
# bundle, and browsers refuse module scripts over file://. So the pack carries this
# instead. Serving on localhost also makes the browser treat the page as a secure
# context, which is what lets the offline cache and the "install as app" button
# work without a certificate.

param(
    [int]$Port = 8173,
    [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$site = Join-Path $root 'site'

if (-not (Test-Path $site)) {
    Write-Host "找不到 site 目录。请把本脚本与 site/ 放在一起。" -ForegroundColor Red
    exit 1
}

$types = @{
    '.html' = 'text/html; charset=utf-8'
    '.js'   = 'text/javascript; charset=utf-8'
    '.mjs'  = 'text/javascript; charset=utf-8'
    '.css'  = 'text/css; charset=utf-8'
    '.json' = 'application/json; charset=utf-8'
    '.webmanifest' = 'application/manifest+json; charset=utf-8'
    '.svg'  = 'image/svg+xml'
    '.png'  = 'image/png'
    '.jpg'  = 'image/jpeg'
    '.glb'  = 'model/gltf-binary'
    '.gltf' = 'model/gltf+json'
    '.txt'  = 'text/plain; charset=utf-8'
    '.md'   = 'text/plain; charset=utf-8'
    '.ico'  = 'image/x-icon'
}

# Find a free port if the preferred one is taken, so a second copy still starts.
$listener = $null
for ($attempt = 0; $attempt -lt 20; $attempt++) {
    $candidate = [System.Net.HttpListener]::new()
    $candidate.Prefixes.Add("http://localhost:$Port/")
    try {
        $candidate.Start()
        $listener = $candidate
        break
    } catch {
        $candidate.Close()
        $Port++
    }
}
if ($null -eq $listener) {
    Write-Host "找不到可用端口，请关掉占用 8173 附近的程序后重试。" -ForegroundColor Red
    exit 1
}

$url = "http://localhost:$Port/"
Write-Host ""
Write-Host "  Cell Atelier 已在运行：" -NoNewline
Write-Host " $url" -ForegroundColor Green
Write-Host "  关掉这个窗口即可停止服务。"
Write-Host ""

if (-not $NoBrowser) {
    Start-Process $url
}

while ($listener.IsListening) {
    $context = $listener.GetContext()
    $request = $context.Request
    $response = $context.Response

    try {
        $relative = [System.Uri]::UnescapeDataString($request.Url.AbsolutePath).TrimStart('/')
        if ([string]::IsNullOrWhiteSpace($relative)) { $relative = 'index.html' }
        $candidate = Join-Path $site $relative

        # never serve outside the pack
        $full = [System.IO.Path]::GetFullPath($candidate)
        if (-not $full.StartsWith([System.IO.Path]::GetFullPath($site))) {
            $response.StatusCode = 403
            $response.Close()
            continue
        }

        if (Test-Path $full -PathType Container) { $full = Join-Path $full 'index.html' }

        if (Test-Path $full -PathType Leaf) {
            $extension = [System.IO.Path]::GetExtension($full).ToLowerInvariant()
            $response.ContentType = if ($types.ContainsKey($extension)) { $types[$extension] } else { 'application/octet-stream' }
            $bytes = [System.IO.File]::ReadAllBytes($full)
            $response.ContentLength64 = $bytes.Length
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
        } else {
            # a client-side route or a missing file: hand back the shell
            $fallback = Join-Path $site 'index.html'
            if (Test-Path $fallback) {
                $response.ContentType = 'text/html; charset=utf-8'
                $bytes = [System.IO.File]::ReadAllBytes($fallback)
                $response.ContentLength64 = $bytes.Length
                $response.OutputStream.Write($bytes, 0, $bytes.Length)
            } else {
                $response.StatusCode = 404
            }
        }
    } catch {
        try { $response.StatusCode = 500 } catch { }
    } finally {
        try { $response.Close() } catch { }
    }
}
