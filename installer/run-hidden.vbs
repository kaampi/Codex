' Launches storycore-service.exe with no visible console window. Node's
' single-executable build is a copy of node.exe, which is a console-
' subsystem binary - without this, the Startup shortcut would pop a black
' console window at every login for a service that has nothing for the
' user to type into or read.
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")
exeFolder = fso.GetParentFolderName(WScript.ScriptFullName)
shell.Run """" & exeFolder & "\storycore-service.exe""", 0, False
