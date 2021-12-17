import express from "express";
import { createServer } from "http";
import { Server, Socket } from "socket.io";
import { Game } from "./common/models/game";
import { gameStr } from "./common/models/game";

// map of each room ID to its respective game session
const rooms: Record<string, Game> = {};

// map of each player's IP address to their respective game session
const players: Record<string, string> = {};

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);
io.on("connection", handleConnect);
httpServer.listen(8080);

// run whenever a client establishes socket.io "websocket" connection to server
function handleConnect(socket: Socket) {
  const ipAddress = socket.handshake.address;
  console.log(`${ipAddress} connected`);

  socket.on("joinedRoom", handleJoinedRoom(socket));
  socket.on("updatedGameState", handleUpdatedGameState(socket));
  socket.on("disconnecting", handleDisconnecting(socket));
}

// run whenever a client emits a "joinedRoom" event
function handleJoinedRoom(socket: Socket) {
  const ipAddress = socket.handshake.address;
  return (roomID: string) => {
    console.log(`${ipAddress} tried to join room ${roomID}`);
    if (ipAddress in players && players[ipAddress] !== roomID) {
      const oldRoomID = players[ipAddress];
      const oldRoom = rooms[oldRoomID];
      oldRoom.players.delete(ipAddress);
      console.log(`${ipAddress} removed from room ${oldRoomID}`);
    }

    if (!(roomID in rooms)) {
      rooms[roomID] = new Game(roomID, ipAddress);
      console.log(`room ${roomID} did not exist; created new room.`);
      console.log(`${ipAddress} set as 'host' of room ${roomID}`);
    }

    players[ipAddress] = roomID;
    const gameState = rooms[roomID];
    gameState.players.add(ipAddress);
    socket.join(roomID);
    console.log(`${ipAddress} added to room ${roomID}`);

    io.to(roomID).emit("updatedGameState", gameState);
    console.log(`sent game state update to room ${roomID}`);
    console.log(`updated game state: `, gameStr(gameState));
  };
}

function handleUpdatedGameState(socket: Socket) {
  const ipAddress = socket.handshake.address;
  return (gameState: Game) => {
    const roomID = players[ipAddress];
    rooms[roomID] = gameState;
    console.log(`received game state update from ${ipAddress}`);

    io.to(roomID).emit("updatedGameState", gameState);
    console.log(`sent game state update to room ${roomID}`);
    console.log(`updated game state: `, gameStr(gameState));
  };
}

function handleDisconnecting(socket: Socket) {
  const ipAddress = socket.handshake.address;
  return () => {
    console.log(`${ipAddress} disconnected`);
    if (ipAddress in players) {
      const roomID = players[ipAddress];
      delete players[ipAddress];
      console.log(`${ipAddress} removed from global player list`);

      if (roomID in rooms) {
        const gameState = rooms[roomID];
        gameState.players.delete(ipAddress);
        console.log(`${ipAddress} removed from room ${roomID}`);

        if (gameState.players.size === 0) {
          delete rooms[roomID];
          io.in(roomID).disconnectSockets(true);
          console.log(`closed empty room ${roomID}`);
        } else if (gameState.hostID === ipAddress) {
          gameState.hostID = Array.from(gameState.players)[0];
          console.log(`${ipAddress} was host; new host is ${gameState.hostID}`);

          io.to(roomID).emit("updatedGameState", gameState);
          console.log(`sent game state update to room ${roomID}`);
          console.log(`updated game state: `, gameStr(gameState));
        }
      }
    }
  };
}
