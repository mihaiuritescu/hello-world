/** A chatroom pinned on the map. Its id doubles as its public number: "Chatroom 7". */
export interface Room {
  id: number
  lat: number
  lng: number
  /** ISO-8601, in UTC. */
  createdAt: string
}

export const LIMITS = {
  /** The map shows at most this many rooms: the newest ones. */
  listedRooms: 1000,
} as const
