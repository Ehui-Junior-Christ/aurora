$ErrorActionPreference = "Continue"

Write-Host "Création du dossier de téléchargement..."
New-Item -ItemType Directory -Force -Path "public\download" | Out-Null

Write-Host "Nettoyage des anciens builds..."
if (Test-Path "dist-electron") { Remove-Item -Recurse -Force "dist-electron" }

Write-Host "Compilation de l'application Web et création de l'exécutable PC (Electron)..."
npm run electron:build

Write-Host "Recherche de l'exécutable généré..."
$exeFile = Get-ChildItem -Path "dist-electron" -Filter "*.exe" | Select-Object -First 1
if ($exeFile) {
    Write-Host "Exécutable trouvé: $($exeFile.Name)"
    Copy-Item $exeFile.FullName -Destination "public\download\AURORA.exe" -Force
} else {
    Write-Warning "L'exécutable PC n'a pas été trouvé."
}

Write-Host "Synchronisation du build web avec Capacitor..."
npx cap sync android

Write-Host "Compilation de l'APK Android..."
Push-Location android
.\gradlew.bat assembleDebug --no-daemon
Pop-Location

$apkFile = "android\app\build\outputs\apk\debug\app-debug.apk"
if (Test-Path $apkFile) {
    Write-Host "APK trouvé!"
    Copy-Item $apkFile -Destination "public\download\aurora-mobile.apk" -Force
} else {
    Write-Warning "L'APK n'a pas été trouvé."
}

Write-Host "Compilation terminée avec succès !"
