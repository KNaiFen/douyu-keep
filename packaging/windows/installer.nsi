Unicode true
!include "MUI2.nsh"
Name "douyu-keep"
OutFile "${OUTPUT_FILE}"
InstallDir "$LOCALAPPDATA\Programs\douyu-keep"
InstallDirRegKey HKCU "Software\douyu-keep" "InstallDir"
RequestExecutionLevel user
!define MUI_ICON "${APP_ICON}"
!define MUI_UNICON "${APP_ICON}"
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "SimpChinese"
!insertmacro MUI_LANGUAGE "English"

!macro CheckRunning
  System::Call 'kernel32::OpenMutexW(i 0x100000, i 0, w "Local\io.github.knaifen.douyu-keep.running") p .r0'
  StrCmp $0 0 notRunning
  System::Call 'kernel32::CloseHandle(p r0)'
  IfSilent +2
  MessageBox MB_OK|MB_ICONEXCLAMATION "Please exit douyu-keep from the tray before installing or uninstalling."
  SetErrorLevel 1
  Abort
  notRunning:
!macroend

Function .onInit
  !insertmacro CheckRunning
FunctionEnd

Function un.onInit
  !insertmacro CheckRunning
FunctionEnd

Section "Install"
  !insertmacro CheckRunning
  SetShellVarContext current
  SetOutPath "$INSTDIR"
  File /r "${APP_DIR}\*"
  WriteRegStr HKCU "Software\douyu-keep" "InstallDir" "$INSTDIR"
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  CreateShortcut "$DESKTOP\douyu-keep.lnk" "$INSTDIR\douyu-keep.exe"
  CreateDirectory "$SMPROGRAMS\douyu-keep"
  CreateShortcut "$SMPROGRAMS\douyu-keep\douyu-keep.lnk" "$INSTDIR\douyu-keep.exe"
  CreateShortcut "$SMPROGRAMS\douyu-keep\Uninstall.lnk" "$INSTDIR\Uninstall.exe"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\douyu-keep" "DisplayName" "douyu-keep"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\douyu-keep" "DisplayVersion" "${APP_VERSION}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\douyu-keep" "UninstallString" '$\"$INSTDIR\Uninstall.exe$\"'
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\douyu-keep" "DisplayIcon" "$INSTDIR\douyu-keep.exe"
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\douyu-keep" "NoModify" 1
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\douyu-keep" "NoRepair" 1
SectionEnd

Section "Uninstall"
  !insertmacro CheckRunning
  SetShellVarContext current
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "io.github.knaifen.douyu-keep"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "io.github.knaifen.douyu-keep"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\douyu-keep"
  DeleteRegKey HKCU "Software\douyu-keep"
  Delete "$DESKTOP\douyu-keep.lnk"
  Delete "$SMPROGRAMS\douyu-keep\douyu-keep.lnk"
  Delete "$SMPROGRAMS\douyu-keep\Uninstall.lnk"
  RMDir "$SMPROGRAMS\douyu-keep"
  RMDir /r "$INSTDIR\app"
  RMDir /r "$INSTDIR\runtime"
  Delete "$INSTDIR\douyu-keep.exe"
  Delete "$INSTDIR\LICENSE"
  Delete "$INSTDIR\Uninstall.exe"
  RMDir "$INSTDIR"
SectionEnd
