import bcrypt from 'bcrypt'
import { Room, Client, ServerError } from 'colyseus'
import { Dispatcher } from '@colyseus/command'
import { Player, OfficeState, Computer, Whiteboard } from './schema/OfficeState'
import { Message } from '../../types/Messages'
import { IRoomData } from '../../types/Rooms'
import { whiteboardRoomIds } from './schema/OfficeState'
import PlayerUpdateCommand from './commands/PlayerUpdateCommand'
import PlayerUpdateNameCommand from './commands/PlayerUpdateNameCommand'
import {
  ComputerAddUserCommand,
  ComputerRemoveUserCommand,
} from './commands/ComputerUpdateArrayCommand'
import {
  WhiteboardAddUserCommand,
  WhiteboardRemoveUserCommand,
} from './commands/WhiteboardUpdateArrayCommand'
import ChatMessageUpdateCommand from './commands/ChatMessageUpdateCommand'

export class SkyOffice extends Room<OfficeState> {
  private dispatcher = new Dispatcher(this)
  private name: string
  private roomNumber: string
  private description: string
  private password: string | null = null

  async onCreate(options: IRoomData) {
    const { name, roomNumber, description, password, autoDispose } = options

    //console.log("room name",name)

    this.name = name
    this.description = description
    this.roomNumber = roomNumber
    this.autoDispose = autoDispose

    let hasPassword = false
    if (password) {
      const salt = await bcrypt.genSalt(10)
      this.password = await bcrypt.hash(password, salt)
      hasPassword = true
    }
    this.setMetadata({ name, roomNumber, description, hasPassword })

    this.setState(new OfficeState())

    // HARD-CODED: Add 5 computers in a room
    for (let i = 0; i < 5; i++) {
      this.state.computers.set(String(i), new Computer())
    }

    // HARD-CODED: Add 3 whiteboards in a room
    for (let i = 0; i < 20; i++) {
      this.state.whiteboards.set(String(i), new Whiteboard())
    }

    // when a player connect to a computer, add to the computer connectedUser array
    this.onMessage(Message.CONNECT_TO_COMPUTER, (client, message: { computerId: string }) => {
      this.dispatcher.dispatch(new ComputerAddUserCommand(), {
        client,
        computerId: message.computerId,
      })
    })

    // when a player disconnect from a computer, remove from the computer connectedUser array
    this.onMessage(Message.DISCONNECT_FROM_COMPUTER, (client, message: { computerId: string }) => {
      this.dispatcher.dispatch(new ComputerRemoveUserCommand(), {
        client,
        computerId: message.computerId,
      })
    })

    // when a player stop sharing screen
    this.onMessage(Message.STOP_SCREEN_SHARE, (client, message: { computerId: string }) => {
      const computer = this.state.computers.get(message.computerId)
      const player = this.state.players.get(client.sessionId)

      computer.connectedUser.forEach((id) => {
        this.clients.forEach((cli) => {
          if (cli.sessionId === id && cli.sessionId !== client.sessionId) {
            cli.send(Message.STOP_SCREEN_SHARE, player.webRTCId)
          }
        })
      })
    })

    // when a player connect to a whiteboard, add to the whiteboard connectedUser array
    this.onMessage(Message.CONNECT_TO_WHITEBOARD, (client, message: { whiteboardId: string }) => {
      this.dispatcher.dispatch(new WhiteboardAddUserCommand(), {
        client,
        whiteboardId: message.whiteboardId,
      })
    })

    // when a player disconnect from a whiteboard, remove from the whiteboard connectedUser array
    this.onMessage(
      Message.DISCONNECT_FROM_WHITEBOARD,
      (client, message: { whiteboardId: string }) => {
        this.dispatcher.dispatch(new WhiteboardRemoveUserCommand(), {
          client,
          whiteboardId: message.whiteboardId,
        })
      }
    )

    // when receiving updatePlayer message, call the PlayerUpdateCommand
    this.onMessage(
      Message.UPDATE_PLAYER,
      (client, message: { x: number; y: number; anim: string }) => {
        this.dispatcher.dispatch(new PlayerUpdateCommand(), {
          client,
          x: message.x,
          y: message.y,
          anim: message.anim,
        })
      }
    )

    // when receiving updatePlayerName message, call the PlayerUpdateNameCommand
    this.onMessage(Message.UPDATE_PLAYER_NAME, (client, message: { name: string }) => {
      this.dispatcher.dispatch(new PlayerUpdateNameCommand(), {
        client,
        name: message.name,
      })
    })

    // when a player is ready to connect, call the PlayerReadyToConnectCommand
    this.onMessage(Message.READY_TO_CONNECT, (client) => {
      const player = this.state.players.get(client.sessionId)
      if (player) player.readyToConnect = true
    })

    // when a player is ready to connect, call the PlayerReadyToConnectCommand
    this.onMessage(Message.VIDEO_CONNECTED, (client) => {
      const player = this.state.players.get(client.sessionId)
      if (player) player.videoConnected = true
    })

    // when a player disconnect a stream, broadcast the signal to the other player connected to the stream
    this.onMessage(Message.DISCONNECT_STREAM, (client, message: { clientId: string }) => {
      const callerWebRTCId = this.state.players.get(client.sessionId).webRTCId
      this.clients.forEach((cli) => {
        if (cli.sessionId === message.clientId) {
          cli.send(Message.DISCONNECT_STREAM, callerWebRTCId)
        }
      })
    })

    // when a player send a chat message, update the message array and broadcast to all connected clients except the sender
    this.onMessage(Message.ADD_CHAT_MESSAGE, (client, message: { content: string }) => {
      // update the message array (so that players join later can also see the message)
      this.dispatcher.dispatch(new ChatMessageUpdateCommand(), {
        client,
        content: message.content,
      })

      // broadcast to all currently connected clients except the sender (to render in-game dialog on top of the character)
      this.broadcast(
        Message.ADD_CHAT_MESSAGE,
        { clientId: client.sessionId, content: message.content },
        { except: client }
      )
    })

    this.onMessage(Message.SEND_ROOM_DATA, (client, message: { id: number, player: string }) => {
      console.log(this.metadata)

    })

    // this.onMessage(Message.PLAYER_SIT_BROADCAST, (client, message: { idBroadcast: number}) => {
    //   console.log("broadcast 0.2",this.metadata)

    // })

    this.onMessage(Message.PLAYER_SIT, (client, message: { id: number, player: string, isBroadcast: boolean, isSit: boolean }) => {
      //console.log(this.metadata)

      var chairs = []
      if(this.metadata.chair && message.id !== -1) chairs = this.metadata.chair

      //add all chair who sit here
      if(message.id !== -1){
      chairs.push({
        id : parseInt(message.id.toString()),
        playerId : message.player
      });
      }else{
        chairs = chairs.filter((x:any) => x.playerId !== message.player)
      }
      
      //var realBroadcast = message.isSit ? message.isBroadcast : false

      this.setMetadata({chair : chairs})

      if(message.isBroadcast){
        // broadcast to all currently connected clients except the sender (to broadcast sit down)
        this.broadcast(
          Message.PLAYER_SIT_BROADCAST,
          { clientId: client.sessionId, content: message },
          { except: client }
        )
      }
      
      //console.log(this.metadata)
    })
  }

  async onAuth(client: Client, options: IRoomData) {
    if (this.password) {
      const validPassword = await bcrypt.compare(options.password, this.password)
      if (!validPassword) throw new ServerError(403, 'Password is incorrect!')
    }
    for (const { webRTCId } of this.state.players.values()) {
      if (webRTCId === options.webRTCId) throw new ServerError(403, 'Duplicated user!')
    }

    return true
  }

  onJoin(client: Client, options: IRoomData) { 

    const { playerName, playerAnim, enterX, enterY, webRTCId, videoConnected, readyToConnect, studentId } = options

    //console.log("onjoin", playerName, playerAnim, enterX, enterY, webRTCId, videoConnected, readyToConnect, isStudent)

    this.state.players.set(
      client.sessionId,
      new Player(playerName, playerAnim, enterX, enterY, webRTCId, videoConnected, readyToConnect, studentId)
    )

    client.send(Message.SEND_ROOM_DATA, {
      name: this.name,
      roomNumber: this.roomNumber,
      description: this.description,
    })
  }

  onLeave(client: Client, consented: boolean) {
    const clientId = client.sessionId
    if (this.state.players.has(clientId)) {
      const player = this.state.players.get(clientId)
      this.state.computers.forEach((computer) => {
        if (computer.connectedUser.has(clientId)) {
          computer.connectedUser.delete(clientId)
        }
        if (computer.connectedWebRTCId.has(player.webRTCId)) {
          computer.connectedWebRTCId.delete(player.webRTCId)
        }
      })
      this.state.whiteboards.forEach((whiteboard) => {
        if (whiteboard.connectedUser.has(clientId)) {
          whiteboard.connectedUser.delete(clientId)
        }
      })
      this.state.players.delete(clientId)
    }

    //console.log("change chair")

    if(this.metadata.chair && this.metadata.chair.length>0){
      this.metadata.chair = this.metadata.chair.filter((x:any) => x.playerId.toString() !== client.id)
      //console.log("change chair", client.id, this.metadata.chair)
    }
  }

  onDispose() {
    this.state.whiteboards.forEach((whiteboard) => {
      if (whiteboardRoomIds.has(whiteboard.roomId)) whiteboardRoomIds.delete(whiteboard.roomId)
    })

    console.log('room', this.roomId, 'disposing...')
    this.dispatcher.stop()
  }
}
