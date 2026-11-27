'use client'

import { useEffect, useRef, useState } from 'react'
import { getAgoraRtcToken, type LiveSessionParticipant } from './use-sessions'

type AgoraTrack = {
  play:()=>void
  stop?:()=>void
  close?:()=>void
  setMuted?:(muted:boolean)=>Promise<void>
  setVolume?:(volume:number)=>void
}
type AgoraRemoteUser = { uid:string|number; hasAudio?:boolean; audioTrack?:AgoraTrack }
type AgoraClient = {
  remoteUsers:AgoraRemoteUser[]
  join:(appId:string,channel:string,token:string,uid:number)=>Promise<unknown>
  leave:()=>Promise<void>
  on:(event:string,handler:(...args:unknown[])=>void)=>void
  subscribe:(user:AgoraRemoteUser,mediaType:'audio')=>Promise<unknown>
  publish:(track:AgoraTrack)=>Promise<void>
  unpublish:(track:AgoraTrack)=>Promise<void>
  renewToken:(token:string)=>Promise<void>
  enableAudioVolumeIndicator?:(interval:number)=>void
}
type AgoraSdk = {
  createClient:(config:{mode:'rtc';codec:'vp8'})=>AgoraClient
  createMicrophoneAudioTrack:()=>Promise<AgoraTrack>
}
declare global {
  interface Window { AgoraRTC?:AgoraSdk }
}

const SDK_URL='https://download.agora.io/sdk/release/AgoraRTC_N-4.24.10.js'

function loadAgoraSdk():Promise<AgoraSdk>{
  if(window.AgoraRTC)return Promise.resolve(window.AgoraRTC)
  return new Promise((resolve,reject)=>{
    let script=document.querySelector<HTMLScriptElement>('script[data-study-agora-sdk]')
    const finish=()=>window.AgoraRTC?resolve(window.AgoraRTC):reject(new Error('AGORA_SDK_LOAD_FAILED'))
    if(script){
      script.addEventListener('load',finish,{once:true})
      script.addEventListener('error',()=>reject(new Error('AGORA_SDK_LOAD_FAILED')),{once:true})
      return
    }
    script=document.createElement('script')
    script.src=SDK_URL
    script.async=true
    script.dataset.studyAgoraSdk='true'
    script.onload=finish
    script.onerror=()=>reject(new Error('AGORA_SDK_LOAD_FAILED'))
    document.head.appendChild(script)
  })
}

function agoraUid(uuid:string):number{
  let hash=2166136261
  for(const char of uuid.toLowerCase()){hash^=char.charCodeAt(0);hash=Math.imul(hash,16777619)}
  const uid=(hash>>>0)&0x7fffffff
  return uid===0?1:uid
}

export function AgoraAudio({
  sessionId,userId,participants,audioAvailable,canPublish,micEnabled,mutedAll,mutedUserIds,volumes,onVolumes,onStatus
}:{
  sessionId:string
  userId:string|null
  participants:LiveSessionParticipant[]
  audioAvailable:boolean
  canPublish:boolean
  micEnabled:boolean
  mutedAll:boolean
  mutedUserIds:string[]
  volumes:Record<string,number>
  onVolumes?:(levels:Record<string,number>)=>void
  onStatus?:(status:'connecting'|'connected'|'disconnected'|'error',message?:string)=>void
}){
  const [joined,setJoined]=useState(false)
  const clientRef=useRef<AgoraClient|null>(null)
  const sdkRef=useRef<AgoraSdk|null>(null)
  const localTrackRef=useRef<AgoraTrack|null>(null)
  const joinedRef=useRef(false)
  const publishedRef=useRef(false)
  const participantsRef=useRef(participants)
  const muteAllRef=useRef(mutedAll)
  const mutedUsersRef=useRef(mutedUserIds)
  const volumesRef=useRef(volumes)
  const userIdRef=useRef(userId)
  const onVolumesRef=useRef(onVolumes)
  const publishDesiredRef=useRef(false)
  participantsRef.current=participants
  muteAllRef.current=mutedAll
  mutedUsersRef.current=mutedUserIds
  volumesRef.current=volumes
  userIdRef.current=userId
  onVolumesRef.current=onVolumes
  publishDesiredRef.current=canPublish&&micEnabled

  useEffect(()=>{
    if(!userId||!audioAvailable){onStatus?.('disconnected');return}
    let disposed=false
    onStatus?.('connecting')
    void (async()=>{
      try{
        const [sdk,token]=await Promise.all([loadAgoraSdk(),getAgoraRtcToken(sessionId,'listen')])
        if(disposed)return
        sdkRef.current=sdk
        const client=sdk.createClient({mode:'rtc',codec:'vp8'})
        clientRef.current=client
        const subscribeAudio=async(user:AgoraRemoteUser)=>{
          try{
            await client.subscribe(user,'audio')
            if(disposed)return
            user.audioTrack?.play()
            applyRemoteVolume(user)
          }catch(error){onStatus?.('error',error instanceof Error?error.message:'AGORA_SUBSCRIBE_FAILED')}
        }
        client.enableAudioVolumeIndicator?.(200)
        client.on('volume-indicator',(...args)=>{
          const users=(args[0]??[]) as Array<{uid:string|number;level:number}>
          const levels:Record<string,number>={}
          for(const user of users){
            const uid=Number(user.uid)
            const participant=participantsRef.current.find(person=>agoraUid(person.user_id)===uid)
            if(participant){
              const level=Math.max(0,Math.min(1,(Number(user.level)||0)/100))
              if(level>=0.035)levels[participant.user_id]=level
            }
          }
          onVolumesRef.current?.(levels)
        })
        client.on('user-published',(...args)=>{
          const user=args[0] as AgoraRemoteUser
          if(args[1]==='audio')void subscribeAudio(user)
        })
        client.on('user-unpublished',(...args)=>{
          const user=args[0] as AgoraRemoteUser
          user.audioTrack?.stop?.()
        })
        client.on('user-left',(...args)=>{
          const user=args[0] as AgoraRemoteUser
          user.audioTrack?.stop?.()
        })
        client.on('connection-state-change',(...args)=>{
          const state=args[0]
          if(state==='CONNECTED')onStatus?.('connected')
          else if(state==='DISCONNECTED')onStatus?.('disconnected')
        })
        client.on('token-privilege-will-expire',async()=>{
          try{
            const next=await getAgoraRtcToken(sessionId,publishedRef.current?'publish_audio':'listen')
            await client.renewToken(next.token)
          }catch(error){onStatus?.('error',error instanceof Error?error.message:'AGORA_TOKEN_RENEW_FAILED')}
        })
        await client.join(token.appId,token.channelName,token.token,token.uid)
        if(disposed){await client.leave();return}
        joinedRef.current=true
        setJoined(true)
        // A participant may have published before this client finished joining.
        // Agora's user-published event is not guaranteed to replay for existing users.
        await Promise.all(client.remoteUsers.filter(user=>user.hasAudio).map(user=>subscribeAudio(user)))
        onStatus?.('connected')
      }catch(error){
        if(!disposed){setJoined(false);onStatus?.('error',error instanceof Error?error.message:'AGORA_CONNECT_FAILED')}
      }
    })()
    return()=>{
      disposed=true
      joinedRef.current=false
      onVolumesRef.current?.({})
      setJoined(false)
      const client=clientRef.current
      const track=localTrackRef.current
      clientRef.current=null
      localTrackRef.current=null
      publishedRef.current=false
      if(track){track.close?.()}
      if(client)void client.leave().catch(()=>{})
    }
  },[sessionId,onStatus,userId,audioAvailable])

  useEffect(()=>{
    let canceled=false
    const sync=async()=>{
      const client=clientRef.current
      const sdk=sdkRef.current
      if(!client||!sdk||!joined||!joinedRef.current)return
      const shouldPublish=canPublish&&micEnabled
      try{
        if(shouldPublish&&!publishedRef.current){
          const token=await getAgoraRtcToken(sessionId,'publish_audio')
          if(canceled)return
          await client.renewToken(token.token)
          const track=await sdk.createMicrophoneAudioTrack()
          if(canceled){track.close?.();return}
          localTrackRef.current=track
          await client.publish(track)
          publishedRef.current=true
        }else if(!shouldPublish&&publishedRef.current){
          const track=localTrackRef.current
          if(track)await client.unpublish(track)
          track?.close?.()
          localTrackRef.current=null
          publishedRef.current=false
          const token=await getAgoraRtcToken(sessionId,'listen')
          if(!canceled)await client.renewToken(token.token)
        }
      }catch(error){
        if(!canceled)onStatus?.('error',error instanceof Error?error.message:'AGORA_AUDIO_PUBLISH_FAILED')
      }
    }
    void sync()
    return()=>{canceled=true}
  },[sessionId,canPublish,micEnabled,joined,onStatus])

  useEffect(()=>{
    const client=clientRef.current
    if(!client)return
    for(const user of client.remoteUsers)applyRemoteVolume(user)
  },[mutedAll,mutedUserIds,volumes,participants,userId])

  function applyRemoteVolume(user:AgoraRemoteUser){
    const uid=Number(user.uid)
    const participant=participantsRef.current.find(person=>agoraUid(person.user_id)===uid)
    if(!participant||participant.user_id===userIdRef.current)return
    const muted=muteAllRef.current||mutedUsersRef.current.includes(participant.user_id)
    const volume=Math.max(0,Math.min(100,Math.round(volumesRef.current[participant.user_id]??100)))
    user.audioTrack?.setVolume?.(muted?0:volume)
  }

  return null
}
