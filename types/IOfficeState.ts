import { Schema, ArraySchema, SetSchema, MapSchema } from '@colyseus/schema'

export interface IPlayer extends Schema {
  name: string
  x: number
  y: number
  anim: string
  webRTCId: string
  readyToConnect: boolean
  videoConnected: boolean
  studentId: number
}

export interface IComputer extends Schema {
  connectedUser: SetSchema<string>
  connectedWebRTCId: SetSchema<string>
}

export interface IWhiteboard extends Schema {
  roomId: string
  connectedUser: SetSchema<string>
}

export interface IChatMessage extends Schema {
  author: string
  createdAt: number
  content: string
}

export interface IOfficeState extends Schema {
  players: MapSchema<IPlayer>
  computers: MapSchema<IComputer>
  whiteboards: MapSchema<IWhiteboard>
  chatMessages: ArraySchema<IChatMessage>
}

export interface IMetaState  {
  name: string
  roomNumber: string
  description: string
  hasPassword: boolean
  chair: Array<IChairState>
}

export interface IChairState {
  id: number
  playerId: string
} 
