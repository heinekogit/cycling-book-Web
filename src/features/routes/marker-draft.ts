import type { EditableMarker } from './markers'

const databaseName = 'cycling-book-marker-drafts'
const storeName = 'drafts'

type StoredMarkerFiles = { key: string; markers: Array<{ id: string; files: File[] }> }

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(storeName, { keyPath: 'key' })
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function saveMarkerFilesDraft(key: string, markers: EditableMarker[]) {
  const database = await openDatabase()
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(storeName, 'readwrite')
      transaction.objectStore(storeName).put({ key, markers: markers.map((marker) => ({ id: marker.id, files: marker.newPhotos })) } satisfies StoredMarkerFiles)
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
    })
  } finally { database.close() }
}

export async function loadMarkerFilesDraft(key: string): Promise<Map<string, File[]>> {
  const database = await openDatabase()
  try {
    const record = await new Promise<StoredMarkerFiles | undefined>((resolve, reject) => {
      const request = database.transaction(storeName, 'readonly').objectStore(storeName).get(key)
      request.onsuccess = () => resolve(request.result as StoredMarkerFiles | undefined)
      request.onerror = () => reject(request.error)
    })
    return new Map((record?.markers ?? []).map((marker) => [marker.id, marker.files]))
  } finally { database.close() }
}

export async function deleteMarkerFilesDraft(key: string) {
  const database = await openDatabase()
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(storeName, 'readwrite')
      transaction.objectStore(storeName).delete(key)
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
    })
  } finally { database.close() }
}
