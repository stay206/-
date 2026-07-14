; Keep the offline library in the selected installation directory. On an
; upgrade the old uninstaller would normally remove the whole directory, so
; temporarily move the library beside it before that uninstaller runs.

!include LogicLib.nsh

Var /GLOBAL vaultUpgradeBackupDir
Var /GLOBAL vaultCopyFailed

Function VaultCopyTree
  Exch $R1
  Exch
  Exch $R0
  Push $R2
  Push $R3

  CreateDirectory "$R1"
  ClearErrors
  FindFirst $R3 $R2 "$R0\*.*"
  IfErrors vault_copy_done

  vault_copy_loop:
    StrCmp $R2 "" vault_copy_close
    StrCmp $R2 "." vault_copy_next
    StrCmp $R2 ".." vault_copy_next

    IfFileExists "$R0\$R2\*.*" vault_copy_directory vault_copy_file

  vault_copy_directory:
    Push "$R0\$R2"
    Push "$R1\$R2"
    Call VaultCopyTree
    Goto vault_copy_next

  vault_copy_file:
    ClearErrors
    CopyFiles /SILENT "$R0\$R2" "$R1"
    IfErrors 0 vault_copy_next
    StrCpy $vaultCopyFailed "1"

  vault_copy_next:
    ClearErrors
    FindNext $R3 $R2
    IfErrors vault_copy_close
    Goto vault_copy_loop

  vault_copy_close:
    FindClose $R3

  vault_copy_done:
    Pop $R3
    Pop $R2
    Pop $R0
    Pop $R1
FunctionEnd

!macro customInit
  StrCpy $vaultCopyFailed "0"
  StrCpy $vaultUpgradeBackupDir "$INSTDIR.__vault-upgrade-backup__"

  ; A prior interrupted upgrade may already have the protected library here.
  ${IfNot} ${FileExists} "$vaultUpgradeBackupDir\*.*"
  ${AndIf} ${FileExists} "$INSTDIR\资料库\*.*"
    ; A sibling rename stays on the same disk and does not duplicate a large
    ; cover cache. If this cannot be renamed, stop before the old uninstaller
    ; gets a chance to delete the original data.
    ClearErrors
    Rename "$INSTDIR\资料库" "$vaultUpgradeBackupDir"
    ${If} ${Errors}
      MessageBox MB_OK|MB_ICONSTOP "无法保护旧版资料库，安装已取消。请关闭正在使用资料库的程序，或确认安装目录可写后重试。"
      Abort
    ${EndIf}
  ${EndIf}
!macroend

!macro customInstall
  ${If} ${FileExists} "$vaultUpgradeBackupDir\*.*"
    ${IfNot} ${FileExists} "$INSTDIR\资料库\*.*"
        ; Same-directory upgrades restore by rename. When the user chooses a
        ; different drive, copy recursively and only remove the backup after
        ; every file has been copied.
        ClearErrors
        Rename "$vaultUpgradeBackupDir" "$INSTDIR\资料库"
        ${If} ${Errors}
          ClearErrors
          StrCpy $vaultCopyFailed "0"
          Push "$vaultUpgradeBackupDir"
          Push "$INSTDIR\资料库"
          Call VaultCopyTree
          ${If} $vaultCopyFailed == "0"
            RMDir /r "$vaultUpgradeBackupDir"
          ${Else}
            MessageBox MB_OK|MB_ICONEXCLAMATION "程序已经安装，但资料库没有完整恢复。原始资料仍保留在：$vaultUpgradeBackupDir"
          ${EndIf}
        ${EndIf}
    ${EndIf}
  ${EndIf}
!macroend

!macro customRemoveFiles
  ; This macro is baked into this and later releases. It makes an uninstall or
  ; subsequent upgrade keep the user-owned library in place by moving it out
  ; before removing the application files.
  ${If} ${isUpdated}
    ${If} ${FileExists} "$INSTDIR\资料库\*.*"
      StrCpy $vaultUpgradeBackupDir "$INSTDIR.__vault-upgrade-backup__"
      ClearErrors
      Rename "$INSTDIR\资料库" "$vaultUpgradeBackupDir"
      ${If} ${Errors}
        Abort "无法保护资料库，已停止升级以避免数据丢失。"
      ${EndIf}
    ${EndIf}

    SetOutPath $TEMP
    RMDir /r "$INSTDIR"
  ${Else}
    ; A manual uninstall deletes the app files but leaves 资料库 exactly where
    ; it is, so a reinstall into the same folder can use it immediately.
    SetOutPath $TEMP
    ClearErrors
    FindFirst $R3 $R2 "$INSTDIR\*.*"
    vault_manual_uninstall_loop:
      StrCmp $R2 "" vault_manual_uninstall_close
      StrCmp $R2 "." vault_manual_uninstall_next
      StrCmp $R2 ".." vault_manual_uninstall_next
      StrCmp $R2 "资料库" vault_manual_uninstall_next

      IfFileExists "$INSTDIR\$R2\*.*" vault_manual_uninstall_directory vault_manual_uninstall_file

    vault_manual_uninstall_directory:
      RMDir /r "$INSTDIR\$R2"
      Goto vault_manual_uninstall_next

    vault_manual_uninstall_file:
      Delete "$INSTDIR\$R2"

    vault_manual_uninstall_next:
      ClearErrors
      FindNext $R3 $R2
      IfErrors vault_manual_uninstall_close
      Goto vault_manual_uninstall_loop

    vault_manual_uninstall_close:
      FindClose $R3
  ${EndIf}
!macroend
