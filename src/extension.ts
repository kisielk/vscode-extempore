'use strict';

import {ProviderResult, TextEdit, CancellationToken, FormattingOptions, TextEditor, TextDocument, Position, Range } from 'vscode';
import * as vscode from 'vscode';
import * as net from 'net';

import { xtmIndent, xtmInSexpr, xtmSexprToString } from './sexpr';

let socket: net.Socket;

let CRLF2LF = (strin: string): string => {
    //console.log("CRLF_IN:\n", strin);
    let strout = strin.replace(/(\r\n|\n|\r)/gm, "\x0A");
    //console.log("LF_OUT:\n", strout);
    return strout;
}

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
    
    console.log('Extempore extension activated.');
    
    // send sexpr
    let sendSexprDisposable = vscode.commands.registerCommand('extension.xtmsend', ()  => {
        let document = vscode.window.activeTextEditor.document;
        let txtstr = document.getText();
        // make sure we are LF ends for Extempore comms
        let pos = vscode.window.activeTextEditor.selection.active;
        let sexpr = xtmInSexpr(txtstr, document.offsetAt(pos) - 1);
        let sexprstr = xtmSexprToString(txtstr, sexpr);
        // console.log("send-data: " + JSON.stringify(sexpr) + "\n'" + sexprstr + "'");
        let unixstr = CRLF2LF(sexprstr);
        let commsstr = unixstr.concat("\r\n");
        socket.write(commsstr);
    });
    context.subscriptions.push(sendSexprDisposable);

    // connect to extempore
    let connectDisposable = vscode.commands.registerCommand('extension.xtmconnect', async () => {
        let hostname: string = await vscode.window.showInputBox({ prompt: 'Hostname', value: 'localhost' });
        let portString: string = await vscode.window.showInputBox({ prompt: 'Port number', value: '7099' });
        let port: number = parseInt(portString);

        // create Extempore socket
        socket = new net.Socket();
        socket.setEncoding('ascii');        
        socket.setKeepAlive(true);

        // set socket callbacks
        socket.connect(port, hostname, () => {
            vscode.window.setStatusBarMessage(`Extempore: connected to port ${port}`);
        });
        socket.on('data', (data) => {
            vscode.window.setStatusBarMessage(data.toString());
        });
        socket.on('close', () => {
            vscode.window.setStatusBarMessage(`Extempore: connection to port ${port} closed`);            
        });
        socket.on('error', (err) => {
            vscode.window.showErrorMessage(`Extempore: socket connection error "${err.message}"`);
        })
    });
    context.subscriptions.push(connectDisposable);

    // connect to extempore
    let disconnectDisposable = vscode.commands.registerCommand('extension.xtmdisconnect', () => {
        socket.destroy();
    });
    context.subscriptions.push(disconnectDisposable);
    
	// The document formatting provider interface defines the contract between extensions and
	// the formatting-feature.
    let indentDisposable = vscode.languages.registerOnTypeFormattingEditProvider('extempore', {
        provideOnTypeFormattingEdits(document: TextDocument, position: Position, ch: string, options: FormattingOptions, token: CancellationToken): ProviderResult<TextEdit[]> {
            let previousLines = new Position(0, 0);
            let backRange = new vscode.Range(previousLines, position);
            let txtstr = document.getText(backRange);
            let indent = xtmIndent(txtstr); 

            vscode.window.activeTextEditor.edit((edit)=> {
                let pos = vscode.window.activeTextEditor.selection.active;                    
                let startOfLine = new Position(pos.line, 0);
                let sol = new Range(startOfLine, pos);
                edit.delete(sol);                                        
                let emptyStr = ' '.repeat(indent);
                edit.insert(startOfLine,emptyStr);
            });
            return null;
        }
    }, '\n');
    context.subscriptions.push(indentDisposable);
}

// this method is called when your extension is deactivated
export function deactivate() {
    socket.destroy();
}