import { supabase } from '../../lib/supabase'

type StorageObject = { bucket: string; path: string }

function storageObjects(value: unknown): StorageObject[] {
  if (!Array.isArray(value)) throw new Error('削除対象の確認に失敗しました。')
  return value.map((item) => {
    if (!item || typeof item !== 'object' || !('bucket' in item) || !('path' in item)
      || typeof item.bucket !== 'string' || typeof item.path !== 'string'
      || !item.bucket || !item.path) throw new Error('削除対象の確認に失敗しました。')
    return { bucket: item.bucket, path: item.path }
  })
}

async function prepare() {
  const { data, error } = await supabase.rpc('prepare_my_account_deletion')
  if (error) throw error
  return storageObjects(data)
}

/** Reentrant: a failed Storage removal leaves the account private and retryable. */
export async function deletePersonalAccountWithData() {
  const targets = await prepare()
  const byBucket = new Map<string, string[]>()
  for (const { bucket, path } of targets) {
    const paths = byBucket.get(bucket) ?? []
    paths.push(path)
    byBucket.set(bucket, paths)
  }
  for (const [bucket, paths] of byBucket) {
    for (let index = 0; index < paths.length; index += 100) {
      const { error } = await supabase.storage.from(bucket).remove(paths.slice(index, index + 100))
      if (error) throw error
    }
  }
  if ((await prepare()).length) throw new Error('写真ファイルが残っています。後でもう一度お試しください。')
  const { error } = await supabase.rpc('complete_my_account_deletion')
  if (error) throw error
}
