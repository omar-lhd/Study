import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  estimatedServerNow,
  pauseVoteResult,
  sharedElapsedSeconds,
  sharedRemainingSeconds,
  suspendSoloForGroupJoin,
  transferSpeakerSeat,
} from './phase2.ts'

const snapshot = {
  status: 'active' as const,
  plannedDurationSeconds: 45 * 60,
  accumulatedStudySeconds: 5 * 60,
  runningSince: '2026-11-26T14:00:00.000Z',
  serverNow: '2026-11-26T14:10:00.000Z',
}

describe('Phase 2 authoritative shared timer', () => {
  it('uses server start timestamps and accumulated segments, not page mount time', () => {
    const serverNow = Date.parse('2026-11-26T14:12:30.000Z')
    assert.equal(sharedElapsedSeconds(snapshot, serverNow), 5 * 60 + 12 * 60 + 30)
    assert.equal(sharedRemainingSeconds(snapshot, serverNow), 27 * 60 + 30)
  })

  it('does not add time while paused or scheduled', () => {
    const paused = { ...snapshot, status: 'paused' as const, runningSince: null }
    assert.equal(sharedElapsedSeconds(paused, Date.parse(snapshot.serverNow)), 5 * 60)
  })

  it('projects a synced server clock forward using local elapsed time', () => {
    assert.equal(
      estimatedServerNow(snapshot, Date.parse(snapshot.serverNow) + 4000),
      Date.parse(snapshot.serverNow) + 4000,
    )
  })

  it('caps elapsed time at the planned duration', () => {
    assert.equal(sharedElapsedSeconds(snapshot, Date.parse('2026-11-26T15:30:00.000Z')), 45 * 60)
  })
})

describe('Phase 2 provisional group pause voting', () => {
  const electorate = ['a','b','c','d'] as const
  it('requires a strict majority of the frozen electorate', () => {
    assert.equal(pauseVoteResult({electorate,votes:{a:'yes',b:'yes'},expiresAt:1000},500),'pending')
    assert.equal(pauseVoteResult({electorate,votes:{a:'yes',b:'yes',c:'yes'},expiresAt:1000},500),'approved')
  })
  it('rejects once a strict majority votes no', () => {
    assert.equal(pauseVoteResult({electorate,votes:{a:'no',b:'no',c:'no'},expiresAt:1000},500),'rejected')
  })
  it('ignores votes from people outside the request electorate', () => {
    assert.equal(pauseVoteResult({electorate,votes:{x:'yes',y:'yes',z:'yes'},expiresAt:1000},500),'pending')
  })
  it('expires requests at the configured expiry timestamp', () => {
    assert.equal(pauseVoteResult({electorate,votes:{a:'yes',b:'yes',c:'yes'},expiresAt:500},500),'expired')
  })
})

describe('Phase 2 speaking-seat transfer', () => {
  const seats = Array.from({length:6},(_,index)=>({seatNumber:index+1,participantId:`speaker-${index+1}`}))
  it('transfers one seat to the requester without changing the other five', () => {
    const next=transferSpeakerSeat(seats,2,'speaker-2','listener-1')
    assert.equal(next.length,6)
    assert.equal(next.find(seat=>seat.seatNumber===2)?.participantId,'listener-1')
    assert.equal(next.filter(seat=>seat.participantId==='speaker-2').length,0)
  })
  it('prevents two speaker seats for one participant', () => {
    assert.throws(()=>transferSpeakerSeat(seats,2,'speaker-2','speaker-3'),/ALREADY_SPEAKER/)
  })
  it('refuses missing/stale source seats', () => {
    assert.throws(()=>transferSpeakerSeat(seats,2,'not-current-speaker','listener-1'),/SPEAKER_SEAT_ALREADY_RELEASED/)
  })
  it('cannot exceed six concurrent speakers', () => {
    assert.throws(()=>transferSpeakerSeat([...seats,{seatNumber:7,participantId:'speaker-7'}],2,'speaker-2','listener-1'),/SPEAKER_SEAT_LIMIT_IS_SIX|SPEAKER_SEAT_CAP_REACHED/)
  })
})

describe('Solo-to-group transition', () => {
  it('suspends and preserves Solo elapsed time rather than resetting it', () => {
    const solo={status:'active' as const,accumulatedMs:120_000,runningSince:1000}
    assert.deepEqual(suspendSoloForGroupJoin(solo,31_000),{status:'paused',accumulatedMs:150_000,runningSince:null})
  })
  it('does not mutate a Solo timer which is already paused', () => {
    const solo={status:'paused' as const,accumulatedMs:90_000,runningSince:null}
    assert.equal(suspendSoloForGroupJoin(solo,100_000),solo)
  })
})
