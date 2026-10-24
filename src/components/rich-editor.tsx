"use client";
import { useRef, useState } from "react";
import { Bold, Italic, Underline, List, Link2 } from "lucide-react";

export function RichEditor({ name="body_html",initial="",placeholder="Write your message...",onChange }:{name?:string;initial?:string;placeholder?:string;onChange?:(html:string)=>void}){
  const editor=useRef<HTMLDivElement>(null),[html,setHtml]=useState(initial);
  function changed(value:string){setHtml(value);onChange?.(value)}
  function format(command:string){editor.current?.focus();document.execCommand(command,false);changed(editor.current?.innerHTML||"")}
  function link(){const url=window.prompt("Link URL (https://...)");if(!url)return;try{const target=new URL(url);if(!["http:","https:"].includes(target.protocol))return;editor.current?.focus();document.execCommand("createLink",false,target.toString());changed(editor.current?.innerHTML||"")}catch{return}}
  return <div className="rich-editor"><div className="editor-toolbar" role="toolbar" aria-label="Message formatting" onMouseDown={event=>event.preventDefault()}><button type="button" onClick={()=>format("bold")} title="Bold" aria-label="Bold"><Bold size={16}/></button><button type="button" onClick={()=>format("italic")} title="Italic" aria-label="Italic"><Italic size={16}/></button><button type="button" onClick={()=>format("underline")} title="Underline" aria-label="Underline"><Underline size={16}/></button><button type="button" onClick={()=>format("insertUnorderedList")} title="List" aria-label="List"><List size={16}/></button><button type="button" onClick={link} title="Insert link" aria-label="Insert link"><Link2 size={16}/></button></div><div ref={editor} className="editor-content" contentEditable suppressContentEditableWarning role="textbox" aria-label={placeholder} aria-multiline="true" data-placeholder={placeholder} onInput={e=>changed(e.currentTarget.innerHTML)} dangerouslySetInnerHTML={{__html:initial}}/><input type="hidden" name={name} value={html}/></div>
}
