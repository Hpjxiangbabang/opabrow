; FloatPane 安装 / 卸载自定义逻辑。
;
; T-01: 目录选择页默认就带上产品子目录，且用户改成任意父目录后实际安装仍会
;       落到 <父目录>\FloatPane，避免把 exe / dll / pak 散落在用户目录根部。
; 说明: electron-builder 的 assistedInstaller.nsh 会在 MUI_PAGE_INSTFILES 的 PRE
;       回调 instFilesPre 中做一次同样的兜底追加（用 StrContains 判重），
;       这里在 .onInit 之后、页面显示之前再规范化一次，使「所见即所得」。
; 注意: 本文件在 MUI2.nsh / LogicLib 之前被 include，因此只使用 NSIS 原生指令，
;       不依赖 ${If} / StrContains 等宏，避免编译时宏未定义。

!ifndef APP_FILENAME
  !define APP_FILENAME "FloatPane"
!endif

; 目录选择页顶部说明，明确告知实际安装路径。
!define MUI_DIRECTORYPAGE_TEXT_TOP "安装程序将在所选文件夹下创建 ${APP_FILENAME} 子文件夹。下方路径即为实际安装位置；若您选择其他文件夹，安装时也会自动追加 ${APP_FILENAME} 子文件夹。"

; 仅在构建安装器时定义：编译卸载器时 customInit 不会被插入，
; 若此处仍定义函数会产生 NSIS 6010「函数未被引用」警告，而 electron-builder 把警告视为错误。
!ifndef BUILD_UNINSTALLER
Function FloatPaneEnsureAppSubdir
  ; 先去掉末尾反斜杠，避免 "…\FloatPane\" 被误判为不含产品名。
  StrCpy $R1 "$INSTDIR" 1 -1
  StrCmp $R1 "\" 0 FloatPaneCheckName
  StrCpy $INSTDIR "$INSTDIR" -1
  FloatPaneCheckName:
  StrCpy $R0 "$INSTDIR" 9 -9
  StrCmp $R0 "${APP_FILENAME}" FloatPaneDone 0
  StrCpy $INSTDIR "$INSTDIR\${APP_FILENAME}"
  FloatPaneDone:
FunctionEnd

!macro customInit
  Call FloatPaneEnsureAppSubdir
!macroend
!endif

; 卸载清理：仅在检测到本应用写入的归属标记时删除数据目录，避免误删同名目录。
; 注意：通过 FLOATPANE_DATA_DIR 显式指定的自定义目录由用户自行管理，卸载脚本不触碰。
!macro customUnInstall
  IfFileExists "$INSTDIR\FloatPane-data\.floatpane-data" 0 +2
    RMDir /r "$INSTDIR\FloatPane-data"
  IfFileExists "$APPDATA\FloatPane-data\.floatpane-data" 0 +2
    RMDir /r "$APPDATA\FloatPane-data"
  ; 卸载完成后尝试移除空的产品目录（非空则保留用户文件，不使用 /r）。
  RMDir "$INSTDIR"
!macroend
