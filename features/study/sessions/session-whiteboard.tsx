'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { PointerEvent } from 'react'
import { ChevronLeft, ChevronRight, Eraser, Grid3X3, Pen, RotateCcw, Square, Type, X, ZoomIn, ZoomOut, Maximize2, MousePointer2, Save, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  addSharedWhiteboardElement,deleteSharedWhiteboardElement,updateSharedWhiteboardElement,getSharedWhiteboardPage,
  listSharedWhiteboardElements,saveSharedWhiteboardPage,subscribeSharedSessionRealtime,
  setMyWhiteboardPresence,type WhiteboardElement
} from './use-sessions'

type WhiteboardSettings={
  width:number
  height:number
  background:string
  grid:'none'|'lines'|'dots'
  gridColor:string
  orientation:'landscape'|'portrait'
}
type Point={x:number;y:number}
type PreviewElement={element_type:WhiteboardElement['element_type'];data:Record<string,unknown>}
type Bounds={x:number;y:number;w:number;h:number}
function elementBounds(element:WhiteboardElement|PreviewElement):Bounds{
  const d=element.data
  if(element.element_type==='stroke'){
    const points=Array.isArray(d.points)?d.points as Point[]:[]
    if(!points.length)return{x:0,y:0,w:0,h:0}
    const xs=points.map(p=>p.x),ys=points.map(p=>p.y)
    const pad=Math.max(12,Number(d.width)||4)
    const x=Math.min(...xs)-pad,y=Math.min(...ys)-pad
    return{x,y,w:Math.max(...xs)-Math.min(...xs)+pad*2,h:Math.max(...ys)-Math.min(...ys)+pad*2}
  }
  const x=Number(d.x)||0,y=Number(d.y)||0
  const w=Number(d.w)||(element.element_type==='text'?Math.max(50,String(d.text||'').length*(Number(d.fontSize)||28)*.62):0)
  const h=Number(d.h)||(element.element_type==='text'?(Number(d.fontSize)||28)*1.4:0)
  return{x:x-8,y:y-8,w:Math.max(24,w+16),h:Math.max(24,h+16)}
}
function hitElement(element:WhiteboardElement,point:Point){
  const b=elementBounds(element)
  return point.x>=b.x-10&&point.x<=b.x+b.w+10&&point.y>=b.y-10&&point.y<=b.y+b.h+10
}
function translateData(data:Record<string,unknown>,dx:number,dy:number){
  if(Array.isArray(data.points))return{...data,points:(data.points as Point[]).map(point=>({x:point.x+dx,y:point.y+dy}))}
  return{...data,x:(Number(data.x)||0)+dx,y:(Number(data.y)||0)+dy}
}
const DEFAULT_SETTINGS:WhiteboardSettings={width:1200,height:800,background:'#ffffff',grid:'lines',gridColor:'#e5e7eb',orientation:'landscape'}

function drawElement(ctx:CanvasRenderingContext2D,element:PreviewElement){
  const data=element.data
  const color=typeof data.color==='string'?data.color:'#111827'
  const width=typeof data.width==='number'?data.width:4
  ctx.save()
  ctx.lineCap='round'
  ctx.lineJoin='round'
  ctx.strokeStyle=color
  ctx.fillStyle=color
  ctx.lineWidth=width
  if(element.element_type==='stroke'){
    const points=Array.isArray(data.points)?data.points as Point[]:[]
    const first=points[0]
    if(first){
      if(data.eraser===true)ctx.globalCompositeOperation='destination-out'
      ctx.beginPath()
      ctx.moveTo(first.x,first.y)
      for(let i=1;i<points.length;i++){const point=points[i];if(point)ctx.lineTo(point.x,point.y)}
      if(points.length===1)ctx.lineTo(first.x+0.1,first.y+0.1)
      ctx.stroke()
    }
  }else if(element.element_type==='shape'){
    const x=Number(data.x)||0,y=Number(data.y)||0,w=Number(data.w)||0,h=Number(data.h)||0
    const shape=data.shape
    ctx.beginPath()
    if(shape==='circle')ctx.ellipse(x+w/2,y+h/2,Math.abs(w/2),Math.abs(h/2),0,0,Math.PI*2)
    else if(shape==='line'){ctx.moveTo(x,y);ctx.lineTo(x+w,y+h)}
    else ctx.rect(x,y,w,h)
    ctx.stroke()
  }else if(element.element_type==='text'){
    const text=typeof data.text==='string'?data.text:''
    ctx.font=(typeof data.fontSize==='number'?data.fontSize:28)+'px sans-serif'
    ctx.textBaseline='top'
    ctx.fillText(text,Number(data.x)||0,Number(data.y)||0)
  }
  ctx.restore()
}

const drawingLayers=new WeakMap<HTMLCanvasElement,HTMLCanvasElement>()
function renderBoard(canvas:HTMLCanvasElement,settings:WhiteboardSettings,elements:PreviewElement[],preview?:PreviewElement){
  const ctx=canvas.getContext('2d')
  if(!ctx)return
  if(canvas.width!==settings.width)canvas.width=settings.width
  if(canvas.height!==settings.height)canvas.height=settings.height
  ctx.clearRect(0,0,canvas.width,canvas.height)
  ctx.fillStyle=settings.background
  ctx.fillRect(0,0,canvas.width,canvas.height)
  if(settings.grid!=='none'){
    ctx.save()
    ctx.strokeStyle=settings.gridColor
    ctx.fillStyle=settings.gridColor
    ctx.globalAlpha=0.72
    const step=40
    if(settings.grid==='lines'){
      ctx.lineWidth=1
      for(let x=0;x<=canvas.width;x+=step){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,canvas.height);ctx.stroke()}
      for(let y=0;y<=canvas.height;y+=step){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(canvas.width,y);ctx.stroke()}
    }else{
      for(let x=0;x<=canvas.width;x+=step)for(let y=0;y<=canvas.height;y+=step){ctx.beginPath();ctx.arc(x,y,1.4,0,Math.PI*2);ctx.fill()}
    }
    ctx.restore()
  }
  let layer=drawingLayers.get(canvas)
  if(!layer){layer=document.createElement('canvas');drawingLayers.set(canvas,layer)}
  if(layer.width!==canvas.width)layer.width=canvas.width
  if(layer.height!==canvas.height)layer.height=canvas.height
  const layerCtx=layer.getContext('2d')
  if(!layerCtx)return
  layerCtx.clearRect(0,0,layer.width,layer.height)
  for(const element of elements)drawElement(layerCtx,element)
  if(preview)drawElement(layerCtx,preview)
  ctx.drawImage(layer,0,0)
}

export function SessionWhiteboard({sessionId,userId,onClose}:{sessionId:string;userId:string|null;onClose:()=>void}){
  const [settings,setSettings]=useState<WhiteboardSettings>(DEFAULT_SETTINGS)
  const [elements,setElements]=useState<WhiteboardElement[]>([])
  const [pageIndex,setPageIndex]=useState(0)
  const [tool,setTool]=useState<'select'|'pen'|'eraser'|'text'|'shape'>('pen')
  const [selectedElementId,setSelectedElementId]=useState<string|null>(null)
  const [selectedData,setSelectedData]=useState<Record<string,unknown>|null>(null)
  const [shape,setShape]=useState<'rect'|'circle'|'line'>('rect')
  const [color,setColor]=useState('#5b4bff')
  const [lineWidth,setLineWidth]=useState(5)
  const [textDraft,setTextDraft]=useState('')
  const [fontSize,setFontSize]=useState(30)
  const [zoom,setZoom]=useState(0.55)
  const viewportRef=useRef<HTMLDivElement|null>(null)
  const [loading,setLoading]=useState(true)
  const [ready,setReady]=useState(false)
  const [error,setError]=useState<string|null>(null)
  const canvasRef=useRef<HTMLCanvasElement|null>(null)
  const drawingRef=useRef(false)
  const strokeRef=useRef<{points:Point[];color:string;width:number;eraser:boolean}|null>(null)
  const shapeRef=useRef<{start:Point;end:Point;shape:'rect'|'circle'|'line'}|null>(null)
  const lastPointRef=useRef<Point|null>(null)
  const selectionDragRef=useRef<{id:string;start:Point;original:Record<string,unknown>}|null>(null)

  const refreshBoard=useCallback(async()=>{
    const [page,rows]=await Promise.all([getSharedWhiteboardPage(sessionId,pageIndex),listSharedWhiteboardElements(sessionId,pageIndex)])
    const next=page?.settings as Partial<WhiteboardSettings>|undefined
    if(next)setSettings(current=>JSON.stringify(current)===JSON.stringify({...DEFAULT_SETTINGS,...next})?current:{...DEFAULT_SETTINGS,...next})
    setElements(rows)
    setLoading(false)
    setReady(true)
  },[sessionId,pageIndex])

  useEffect(()=>{
    let alive=true
    setLoading(true);setReady(false);setError(null)
    void refreshBoard().catch(e=>{if(alive){setError(e instanceof Error?e.message:'WHITEBOARD_LOAD_FAILED');setLoading(false)}})
    return()=>{alive=false}
  },[refreshBoard])

  useEffect(()=>{
    if(!userId)return
    void setMyWhiteboardPresence(sessionId,true).catch(()=>{})
    return()=>{void setMyWhiteboardPresence(sessionId,false).catch(()=>{})}
  },[sessionId,userId])

  useEffect(()=>subscribeSharedSessionRealtime(sessionId,()=>{if(!drawingRef.current)void refreshBoard().catch(()=>{})}),[sessionId,refreshBoard])

  useEffect(()=>{
    const canvas=canvasRef.current
    if(!canvas)return
    const selected=elements.find(element=>element.id===selectedElementId)
    if(selected&&selectedData){
      renderBoard(canvas,settings,elements.filter(element=>element.id!==selected.id),{element_type:selected.element_type,data:selectedData})
    }else renderBoard(canvas,settings,elements)
  },[settings,elements,selectedElementId,selectedData])

  useEffect(()=>{
    const viewport=viewportRef.current
    if(!viewport)return
    const fit=()=>{
      const availableWidth=Math.max(160,viewport.clientWidth-32)
      const availableHeight=Math.max(160,viewport.clientHeight-32)
      setZoom(Math.max(0.25,Math.min(2.5,availableWidth/settings.width,availableHeight/settings.height)))
    }
    const observer=new ResizeObserver(fit)
    observer.observe(viewport)
    fit()
    return()=>observer.disconnect()
  },[settings.width,settings.height])

  const changeZoom=(delta:number)=>setZoom(value=>Math.max(0.25,Math.min(2.5,Math.round((value+delta)*100)/100)))
  const fitBoard=()=>{
    const viewport=viewportRef.current
    if(!viewport)return
    setZoom(Math.max(0.25,Math.min(2.5,(viewport.clientWidth-32)/settings.width,(viewport.clientHeight-32)/settings.height)))
  }

  useEffect(()=>{
    if(!ready||!userId)return
    const timer=window.setTimeout(()=>saveSharedWhiteboardPage(sessionId,pageIndex,settings,userId).catch(e=>setError(e instanceof Error?e.message:'WHITEBOARD_SETTINGS_SAVE_FAILED')),450)
    return()=>window.clearTimeout(timer)
  },[ready,sessionId,pageIndex,settings,userId])

  const pointFromEvent=(event:PointerEvent<HTMLCanvasElement>):Point=>{
    const canvas=event.currentTarget
    const rect=canvas.getBoundingClientRect()
    return {x:(event.clientX-rect.left)*canvas.width/rect.width,y:(event.clientY-rect.top)*canvas.height/rect.height}
  }

  const saveElement=async(elementType:WhiteboardElement['element_type'],data:Record<string,unknown>)=>{
    if(!userId){toast.error('Sign in to edit the whiteboard');return}
    try{
      const rows=await addSharedWhiteboardElement(sessionId,pageIndex,userId,elementType,data)
      const created=rows[0]
      if(created)setElements(current=>[...current,created])
    }catch(e){toast.error(e instanceof Error?e.message:'WHITEBOARD_SAVE_FAILED')}
  }

  const onPointerDown=(event:PointerEvent<HTMLCanvasElement>)=>{
    if(loading||error)return
    const point=pointFromEvent(event)
    event.currentTarget.setPointerCapture(event.pointerId)
    if(tool==='select'){
      const target=[...elements].reverse().find(element=>hitElement(element,point))
      setSelectedElementId(target?.id??null)
      setSelectedData(target?{...target.data}:null)
      if(target){drawingRef.current=true;selectionDragRef.current={id:target.id,start:point,original:{...target.data}}}
      return
    }
    setSelectedElementId(null);setSelectedData(null)
    if(tool==='text'){
      if(!textDraft.trim())return
      void saveElement('text',{x:point.x,y:point.y,text:textDraft.trim(),color,fontSize})
      return
    }
    drawingRef.current=true
    lastPointRef.current=point
    if(tool==='shape')shapeRef.current={start:point,end:point,shape}
    else strokeRef.current={points:[point],color,width:lineWidth,eraser:tool==='eraser'}
  }

  const onPointerMove=(event:PointerEvent<HTMLCanvasElement>)=>{
    if(!drawingRef.current)return
    const point=pointFromEvent(event)
    const selection=selectionDragRef.current
    if(selection){
      const dx=point.x-selection.start.x,dy=point.y-selection.start.y
      const data=translateData(selection.original,dx,dy)
      setSelectedData(data)
      const selected=elements.find(element=>element.id===selection.id)
      if(selected)renderBoard(event.currentTarget,settings,elements.filter(element=>element.id!==selected.id),{element_type:selected.element_type,data})
      return
    }
    if(strokeRef.current){
      const previous=lastPointRef.current
      strokeRef.current.points.push(point)
      const ctx=event.currentTarget.getContext('2d')
      if(ctx&&previous){
        if(strokeRef.current.eraser){
          renderBoard(event.currentTarget,settings,elements,{element_type:'stroke',data:{points:strokeRef.current.points,color:strokeRef.current.color,width:strokeRef.current.width,eraser:true}})
        }else{
          ctx.save()
          ctx.strokeStyle=strokeRef.current.color
          ctx.lineWidth=strokeRef.current.width
          ctx.lineCap='round';ctx.lineJoin='round'
          ctx.beginPath();ctx.moveTo(previous.x,previous.y);ctx.lineTo(point.x,point.y);ctx.stroke()
          ctx.restore()
        }
      }
      lastPointRef.current=point
    }else if(shapeRef.current){
      shapeRef.current.end=point
      const item=shapeRef.current
      renderBoard(event.currentTarget,settings,elements,{element_type:'shape',data:{shape:item.shape,x:item.start.x,y:item.start.y,w:item.end.x-item.start.x,h:item.end.y-item.start.y,color,width:lineWidth}})
    }
  }

  const onPointerUp=async()=>{
    if(!drawingRef.current)return
    drawingRef.current=false
    const selection=selectionDragRef.current
    if(selection){
      selectionDragRef.current=null
      const data=selectedData
      if(data){
        try{
          await updateSharedWhiteboardElement(selection.id,data)
          setElements(current=>current.map(element=>element.id===selection.id?{...element,data}:element))
        }catch(e){toast.error(e instanceof Error?e.message:'WHITEBOARD_UPDATE_FAILED')}
      }
      return
    }
    if(strokeRef.current){
      const stroke=strokeRef.current
      strokeRef.current=null
      await saveElement('stroke',{points:stroke.points,color:stroke.color,width:stroke.width,eraser:stroke.eraser})
    }else if(shapeRef.current){
      const item=shapeRef.current
      shapeRef.current=null
      await saveElement('shape',{shape:item.shape,x:item.start.x,y:item.start.y,w:item.end.x-item.start.x,h:item.end.y-item.start.y,color,width:lineWidth})
    }
    lastPointRef.current=null
  }

  const undoOwnElement=async()=>{
    if(!userId)return
    const last=[...elements].reverse().find(element=>element.created_by===userId)
    if(!last)return
    try{await deleteSharedWhiteboardElement(last.id);setElements(current=>current.filter(element=>element.id!==last.id))}
    catch(e){toast.error(e instanceof Error?e.message:'WHITEBOARD_UNDO_FAILED')}
  }

  const rotatePage=()=>setSettings(current=>({...current,width:current.height,height:current.width,orientation:current.orientation==='landscape'?'portrait':'landscape'}))
  const changePage=(delta:number)=>setPageIndex(current=>Math.max(0,Math.min(49,current+delta)))

  return <div className="fixed inset-0 z-[100] flex h-[100dvh] flex-col overflow-hidden bg-[#07091e] text-white">
    <header className="flex shrink-0 items-center gap-2 border-b border-white/10 bg-[#0b0d27] px-3 py-2">
      <button type="button" onClick={onClose} className="grid size-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/5" aria-label="Close whiteboard"><X className="size-5"/></button>
      <div className="min-w-0 flex-1"><h2 className="truncate text-sm font-semibold">سبورة الجلسة</h2><p className="text-[10px] text-slate-400">تغييراتك محفوظة ومشتركة مع أعضاء الجلسة</p></div>
      <button type="button" onClick={()=>changePage(-1)} disabled={pageIndex===0} className="grid size-9 place-items-center rounded-lg bg-white/5 disabled:opacity-30" aria-label="Previous page"><ChevronRight className="size-4"/></button>
      <span className="text-xs tabular-nums">{pageIndex+1}/50</span>
      <button type="button" onClick={()=>changePage(1)} className="grid size-9 place-items-center rounded-lg bg-white/5" aria-label="Next page"><ChevronLeft className="size-4"/></button>
    </header>
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-white/10 bg-[#0b0d27] px-3 py-2">
      <div className="flex items-center gap-1 rounded-xl bg-white/5 p-1">
        <button type="button" onClick={()=>setTool('select')} className={cn('grid size-9 place-items-center rounded-lg',tool==='select'?'bg-violet-600 text-white':'text-slate-300')} aria-label="Select and move"><MousePointer2 className="size-4"/></button>
        <button type="button" onClick={()=>setTool('pen')} className={cn('grid size-9 place-items-center rounded-lg',tool==='pen'?'bg-violet-600 text-white':'text-slate-300')} aria-label="Pen"><Pen className="size-4"/></button>
        <button type="button" onClick={()=>setTool('eraser')} className={cn('grid size-9 place-items-center rounded-lg',tool==='eraser'?'bg-violet-600 text-white':'text-slate-300')} aria-label="Eraser"><Eraser className="size-4"/></button>
        <button type="button" onClick={()=>setTool('text')} className={cn('grid size-9 place-items-center rounded-lg',tool==='text'?'bg-violet-600 text-white':'text-slate-300')} aria-label="Text"><Type className="size-4"/></button>
        <button type="button" onClick={()=>setTool('shape')} className={cn('grid size-9 place-items-center rounded-lg',tool==='shape'?'bg-violet-600 text-white':'text-slate-300')} aria-label="Shape"><Square className="size-4"/></button>
      </div>
      {tool==='shape'?<select value={shape} onChange={e=>setShape(e.target.value as 'rect'|'circle'|'line')} className="h-9 rounded-lg border border-white/10 bg-[#10122d] px-2 text-xs"><option value="rect">مستطيل</option><option value="circle">دائرة</option><option value="line">خط</option></select>:null}
      <label className="flex items-center gap-1 rounded-lg bg-white/5 px-2 py-1 text-xs"><span>القلم</span><input type="color" value={color} onChange={e=>setColor(e.target.value)} className="size-7 border-0 bg-transparent p-0"/></label>
      <label className="flex items-center gap-2 rounded-lg bg-white/5 px-2 py-1 text-xs"><span>الحجم</span><input type="range" min="1" max="24" value={lineWidth} onChange={e=>setLineWidth(Number(e.target.value))} className="w-20 accent-violet-500"/><span className="w-4 tabular-nums">{lineWidth}</span></label>
      {tool==='text'?<><input value={textDraft} onChange={e=>setTextDraft(e.target.value)} placeholder="اكتب النص ثم اضغط على الصفحة" className="h-9 min-w-32 flex-1 rounded-lg border border-white/10 bg-[#10122d] px-2 text-xs"/><label className="flex items-center gap-1 text-xs"><span>حجم</span><input type="number" min="10" max="120" value={fontSize} onChange={e=>setFontSize(Number(e.target.value))} className="h-9 w-14 rounded-lg bg-[#10122d] px-1"/></label></>:null}
      {tool==='select'&&selectedData?<><label className="flex items-center gap-1 text-xs">لون<input type="color" value={typeof selectedData.color==='string'?selectedData.color:color} onChange={e=>setSelectedData(data=>data?{...data,color:e.target.value}:data)} className="size-7 bg-transparent p-0"/></label><label className="flex items-center gap-1 text-xs">حجم<input type="range" min="1" max="40" value={Number(selectedData.width)||4} onChange={e=>setSelectedData(data=>data?{...data,width:Number(e.target.value)}:data)} className="w-16 accent-violet-500"/></label>{elements.find(element=>element.id===selectedElementId)?.element_type==='text'?<label className="flex items-center gap-1 text-xs">حجم النص<input type="number" min="10" max="120" value={Number(selectedData.fontSize)||28} onChange={e=>setSelectedData(data=>data?{...data,fontSize:Math.max(10,Math.min(120,Number(e.target.value)||10))}:data)} className="h-8 w-14 rounded-lg bg-[#10122d] px-1"/></label>:null}{typeof selectedData.w==='number'?<div className="flex items-center gap-1"><label className="text-[10px]">W<input type="number" value={Number(selectedData.w)} onChange={e=>setSelectedData(data=>data?{...data,w:Number(e.target.value)}:data)} className="h-8 w-14 rounded bg-[#10122d] px-1"/></label><label className="text-[10px]">H<input type="number" value={Number(selectedData.h)} onChange={e=>setSelectedData(data=>data?{...data,h:Number(e.target.value)}:data)} className="h-8 w-14 rounded bg-[#10122d] px-1"/></label></div>:null}<button type="button" onClick={async()=>{if(!selectedElementId||!selectedData)return;try{await updateSharedWhiteboardElement(selectedElementId,selectedData);setElements(rows=>rows.map(row=>row.id===selectedElementId?{...row,data:selectedData}:row));toast.success('تم حفظ التعديل')}catch(e){toast.error(e instanceof Error?e.message:'WHITEBOARD_UPDATE_FAILED')}}} className="grid size-9 place-items-center rounded-lg bg-violet-600" aria-label="Save selected element"><Save className="size-4"/></button><button type="button" onClick={async()=>{if(!selectedElementId)return;try{await deleteSharedWhiteboardElement(selectedElementId);setElements(rows=>rows.filter(row=>row.id!==selectedElementId));setSelectedElementId(null);setSelectedData(null)}catch(e){toast.error(e instanceof Error?e.message:'WHITEBOARD_DELETE_FAILED')}}} className="grid size-9 place-items-center rounded-lg bg-rose-500/15 text-rose-300" aria-label="Delete selected element"><Trash2 className="size-4"/></button></>:null}
      <button type="button" onClick={undoOwnElement} className="grid size-9 place-items-center rounded-lg bg-white/5" aria-label="Undo last own element"><RotateCcw className="size-4"/></button>
      <div className="ms-auto flex items-center gap-1 rounded-xl bg-white/5 p-1" aria-label="Canvas zoom controls">
        <button type="button" onClick={()=>changeZoom(-0.1)} disabled={zoom<=0.25} className="grid size-8 place-items-center rounded-lg disabled:opacity-30" aria-label="Zoom out"><ZoomOut className="size-4"/></button>
        <span className="min-w-12 text-center text-xs tabular-nums" dir="ltr">{Math.round(zoom*100)}%</span>
        <button type="button" onClick={()=>changeZoom(0.1)} disabled={zoom>=2.5} className="grid size-8 place-items-center rounded-lg disabled:opacity-30" aria-label="Zoom in"><ZoomIn className="size-4"/></button>
        <button type="button" onClick={fitBoard} className="grid size-8 place-items-center rounded-lg" aria-label="Fit page to screen"><Maximize2 className="size-4"/></button>
      </div>
    </div>
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-white/10 bg-[#0b0d27] px-3 py-2">
      <label className="flex items-center gap-1 rounded-lg bg-white/5 px-2 py-1 text-xs"><span>الصفحة</span><input type="color" value={settings.background} onChange={e=>setSettings(s=>({...s,background:e.target.value}))} className="size-7 bg-transparent p-0"/></label>
      <label className="flex items-center gap-1 rounded-lg bg-white/5 px-2 py-1 text-xs"><span>الأسطر</span><input type="color" value={settings.gridColor} onChange={e=>setSettings(s=>({...s,gridColor:e.target.value}))} className="size-7 bg-transparent p-0"/></label>
      <select value={settings.grid} onChange={e=>setSettings(s=>({...s,grid:e.target.value as WhiteboardSettings['grid']}))} className="h-9 rounded-lg border border-white/10 bg-[#10122d] px-2 text-xs"><option value="none">بدون خطوط</option><option value="lines">أسطر</option><option value="dots">نقاط</option></select>
      <button type="button" onClick={rotatePage} className="flex h-9 items-center gap-1 rounded-lg bg-white/5 px-2 text-xs"><Grid3X3 className="size-4"/>تدوير الصفحة</button>
      <label className="flex items-center gap-1 text-xs">W<input type="number" min="400" max="3000" step="100" value={settings.width} onChange={e=>setSettings(s=>({...s,width:Math.max(400,Math.min(3000,Number(e.target.value)||400))}))} className="h-9 w-16 rounded-lg bg-[#10122d] px-1"/></label>
      <label className="flex items-center gap-1 text-xs">H<input type="number" min="400" max="3000" step="100" value={settings.height} onChange={e=>setSettings(s=>({...s,height:Math.max(400,Math.min(3000,Number(e.target.value)||400))}))} className="h-9 w-16 rounded-lg bg-[#10122d] px-1"/></label>
    </div>
    <div ref={viewportRef} className="relative min-h-0 flex-1 overflow-auto overscroll-contain p-2 sm:p-4">
      <div className="relative mx-auto" style={{width:settings.width*zoom,height:settings.height*zoom}}>
        <canvas ref={canvasRef} className="absolute left-0 top-0 touch-none rounded-xl border border-slate-300/20 shadow-2xl" style={{width:settings.width*zoom,height:settings.height*zoom,backgroundColor:settings.background,cursor:tool==='text'?'text':tool==='select'?'move':tool==='eraser'?'cell':'crosshair'}} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={()=>void onPointerUp()} onPointerCancel={()=>void onPointerUp()}/>
      </div>
      {loading?<div className="absolute inset-0 grid place-items-center bg-black/35 text-sm">جاري تحميل السبورة...</div>:null}
      {error?<div className="absolute inset-0 grid place-items-center bg-black/60 p-4 text-center text-sm text-rose-200">{error}<Button className="mt-3" onClick={()=>void refreshBoard()}>حاول تاني</Button></div>:null}
    </div>
    <footer className="flex shrink-0 items-center justify-between border-t border-white/10 bg-[#0b0d27] px-3 py-2 text-xs text-slate-400"><span>{elements.length} عنصر محفوظ</span><span className="flex items-center gap-1"><span className="size-2 rounded-full bg-emerald-400"/>تعاون مباشر</span></footer>
  </div>
}
