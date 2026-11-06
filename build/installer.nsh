; FloatPane 卸载清理：应用运行期产生的全部数据集中在 FloatPane-data 目录。
; 默认随安装目录存放；若安装目录不可写而回退到 %APPDATA%，也一并清除。
; 仅当目录内存在本应用写入的 .floatpane-data 标记时才删除，避免误删同名用户目录。
; 注意：通过 FLOATPANE_DATA_DIR 显式指定的自定义目录由用户自行管理，卸载脚本不触碰。
!macro customUnInstall
  IfFileExists "$INSTDIR\FloatPane-data\.floatpane-data" 0 +2
    RMDir /r "$INSTDIR\FloatPane-data"
  IfFileExists "$APPDATA\FloatPane-data\.floatpane-data" 0 +2
    RMDir /r "$APPDATA\FloatPane-data"
!macroend
