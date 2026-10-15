// 저장에 실패한 응답과 화면 위치(step)를 기기에 임시 보관하는 큐. 순수 로직이라 저장소를 인자로 받는다.
// (화면에서는 localStorage, 테스트에서는 메모리 객체)

export type QueueStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
};

/** step 저장 요청을 담는 항목의 키. 응답 항목 id(g01, a01 …)와 겹치지 않는다. */
export const STEP_KEY = "__step__";

export type ResponseItem = { itemId: string; value: boolean };
export type StepItem = { itemId: typeof STEP_KEY; value: string };
export type PendingItem = ResponseItem | StepItem;

export function isStepItem(item: PendingItem): item is StepItem {
  return item.itemId === STEP_KEY;
}

export type SaveQueue = {
  /** 같은 항목을 다시 넣으면 값만 바뀌고(마지막 값만 남음) 원래 위치를 유지한다. */
  enqueue(itemId: string, value: boolean): void;
  /** 화면 위치 저장 요청. 항상 최신 step 하나만 남는다. */
  enqueueStep(step: string): void;
  /**
   * 대기 중인 항목을 돌려준다. 응답 항목은 넣은 순서대로, step 은 언제 넣었든 항상 맨 뒤다
   * (응답을 모두 보낸 뒤에 step 을 보내야 서버의 응답 개수 검사를 통과한다).
   */
  peekAll(): PendingItem[];
  /**
   * 항목을 뺀다. ifValue 를 주면 현재 값이 같을 때만 뺀다.
   * (전송 중에 같은 항목이 다른 값으로 바뀌었다면 새 값이 남아 있어야 한다.)
   */
  remove(itemId: string, ifValue?: boolean | string): void;
  size(): number;
  clear(): void;
};

export const queueKey = (courseCode: string) => `jd_pending:${courseCode}`;
const ownerKey = (courseCode: string) => `jd_pending_owner:${courseCode}`;

function toEntry(raw: unknown): PendingItem | null {
  if (typeof raw !== "object" || raw === null) return null;
  const { itemId, value } = raw as { itemId?: unknown; value?: unknown };
  if (typeof itemId !== "string") return null;
  if (itemId === STEP_KEY) return typeof value === "string" ? { itemId: STEP_KEY, value } : null;
  return typeof value === "boolean" ? { itemId, value } : null;
}

/** step 을 맨 뒤로 보낸다. 나머지 순서는 유지한다. */
function stepLast(items: PendingItem[]): PendingItem[] {
  return [...items.filter((item) => !isStepItem(item)), ...items.filter(isStepItem)];
}

function parse(raw: string | null): PendingItem[] {
  if (raw === null) return [];
  try {
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    const seen = new Set<string>();
    const items: PendingItem[] = [];
    for (const entry of data) {
      const item = toEntry(entry);
      if (!item || seen.has(item.itemId)) continue;
      seen.add(item.itemId);
      items.push(item);
    }
    return items;
  } catch {
    // 저장소 내용이 깨졌으면 빈 목록으로 복구한다.
    return [];
  }
}

export function createSaveQueue(storage: QueueStorage, courseCode: string): SaveQueue {
  const key = queueKey(courseCode);
  // 저장소가 막혀 있어도(시크릿 모드, 용량 초과) 이번 방문 동안은 메모리로 동작한다.
  let memory: PendingItem[] = [];
  let storageWritable = true;

  function load(): PendingItem[] {
    if (!storageWritable) return stepLast(memory).map((item) => ({ ...item }));
    try {
      memory = parse(storage.getItem(key));
    } catch {
      // 읽기 실패: 메모리 사본을 쓴다.
    }
    return stepLast(memory).map((item) => ({ ...item }));
  }

  function save(items: PendingItem[]): void {
    memory = items;
    try {
      storage.setItem(key, JSON.stringify(items));
    } catch {
      // 저장 실패: 메모리에만 남는다.
      storageWritable = false;
    }
  }

  function upsert(item: PendingItem): void {
    const items = load();
    const index = items.findIndex((existing) => existing.itemId === item.itemId);
    if (index >= 0) items[index] = item;
    else items.push(item);
    save(items);
  }

  return {
    enqueue(itemId, value) {
      if (itemId === STEP_KEY) throw new Error("step 은 enqueueStep 으로 넣어야 합니다.");
      upsert({ itemId, value });
    },
    enqueueStep(step) {
      upsert({ itemId: STEP_KEY, value: step });
    },
    peekAll: load,
    remove(itemId, ifValue) {
      const items = load();
      const next = items.filter(
        (item) => !(item.itemId === itemId && (ifValue === undefined || item.value === ifValue)),
      );
      if (next.length !== items.length) save(next);
    },
    size: () => load().length,
    clear() {
      save([]);
    },
  };
}

/**
 * 큐를 세션 소유자(ownerId)에 묶어서 연다.
 * 같은 기기·같은 과정에서 다른 사람이 이어받았다면 이전 사람의 대기 항목은 버린다
 * (다른 사람의 응답이 새 세션에 섞이지 않게 하기 위해).
 */
export function openOwnedQueue(storage: QueueStorage, courseCode: string, ownerId: string): SaveQueue {
  const queue = createSaveQueue(storage, courseCode);
  try {
    const owner = storage.getItem(ownerKey(courseCode));
    if (owner !== ownerId) {
      if (owner !== null) queue.clear();
      storage.setItem(ownerKey(courseCode), ownerId);
    }
  } catch {
    // 저장소를 못 쓰면 소유자 표시 없이 진행한다.
  }
  return queue;
}
