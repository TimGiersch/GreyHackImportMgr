# GreyHack ImportMgr

Extension for GreyHack / GreyScript (`.src`).

This is a extension on top of: "Greybel VS" by "_ayecue"

## Features
- Automatic path resolution for `import_code`
- Project-wide auto-completion
- “Go to Definition” for methods, functions, and objects

It's recommended to only activate this extension in GreyHack-Projects and not by default.
-> Use VS Codes Profile Manager for this.

## Usage
Its Important that your import_code(path) is equal to your local folder

Example:

GreyHack:
import_code(/home/user/Project/Main.src)
import_code(/home/user/Project/Utils/test.src)

Local:
Project (Working dir / open in vs)
|-- Main.src
|-- Utils/test.src

## Building
To Use this Extension -> 

1. open the Extension Folder in VS Code.
2. run: "npm install" in projekt root dir

a. Use f5 to start a Test Window (Performance is reduced and the programm can crash)

OR

b. Use npm to build a .vsix file and import it into your VS extension Tab under the three dots.

commands:
3. npm install -g @vscode/vsce
4. vsce package
 -> input "y" if needed
