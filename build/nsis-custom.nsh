; 自定义 NSIS 卸载行为
; 在手动卸载时弹窗询问是否清除用户数据
; 升级（静默）时自动保留数据，不弹窗

!macro customUnInit
  Var /GLOBAL myKeepAppData
  ${ifNot} ${Silent}
  ${andIfNot} ${isUpdated}
    MessageBox MB_YESNO "是否同时清除用户配置数据？$\n（包括书签、设置、历史记录、AI对话记录等）$\n$\n是 = 清除所有数据$\n否 = 保留数据" /SD IDNO IDNO keepData
    StrCpy $myKeepAppData "0"
    Goto done
    keepData:
    StrCpy $myKeepAppData "1"
    done:
  ${else}
    ; 升级（静默）时自动保留数据
    StrCpy $myKeepAppData "1"
  ${endif}
!macroend

!macro customUnInstall
  ${if} $myKeepAppData == "0"
    RMDir /r "$APPDATA\${APP_FILENAME}"
    !ifdef APP_PRODUCT_FILENAME
      RMDir /r "$APPDATA\${APP_PRODUCT_FILENAME}"
    !endif
    !ifdef APP_PACKAGE_NAME
      RMDir /r "$APPDATA\${APP_PACKAGE_NAME}"
    !endif
  ${endif}
!macroend
