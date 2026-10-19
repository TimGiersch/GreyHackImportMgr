# GreyHack ImportMgr

Extension for GreyHack / GreyScript (`.src`).<br>

This is a extension on top of: "Greybel VS" by "_ayecue"<br>

## Features
- Automatic path resolution for `import_code`<br>
- Project-wide auto-completion<br>
- “Go to Definition” for methods, functions, and objects<br>

It's recommended to only activate this extension in GreyHack-Projects and not by default.<br>
-> Use VS Codes Profile Manager for this.<br>

## Usage
Its Important that your import_code(path) is equal to your local folder<br>

Example:<br>

GreyHack:<br>
import_code(/home/user/Project/Main.src)<br>
import_code(/home/user/Project/Utils/test.src)<br>

Local:<br>
   Project (Working dir / open in vs)<br>
   |-- Main.src<br>
   |-- Utils/test.src<br>

## Building
To Use this Extension -> <br>

1. open the Extension Folder in VS Code.<br>
2. run: "npm install" in projekt root dir<br>

a. Use f5 to start a Test Window (Performance is reduced and the programm can crash)<br>

OR<br>

b. Use npm to build a .vsix file and import it into your VS extension Tab under the three dots.<br>

commands:<br>
3. npm install -g @vscode/vsce<br>
4. vsce package<br>
 -> input "y" if needed
