import { describe, expect, it } from "vitest";
import {
  STEP_KEY,
  createSaveQueue,
  isStepItem,
  openOwnedQueue,
  queueKey,
  type QueueStorage,
} from "../saveQueue";

function memoryStorage(initial: Record<string, string> = {}): QueueStorage & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (key) => (key in data ? data[key] : null),
    setItem: (key, value) => {
      data[key] = value;
    },
    removeItem: (key) => {
      delete data[key];
    },
  };
}

const CODE = "abcDEF0123456789_-xy";

describe("saveQueue", () => {
  it("저장 키는 과정별로 jd_pending:{courseCode} 다", () => {
    const storage = memoryStorage();
    createSaveQueue(storage, CODE).enqueue("g01", true);
    expect(Object.keys(storage.data)).toEqual([`jd_pending:${CODE}`]);
    expect(queueKey(CODE)).toBe(`jd_pending:${CODE}`);

    createSaveQueue(storage, "otherCourse0123456789").enqueue("g02", false);
    expect(createSaveQueue(storage, CODE).peekAll()).toEqual([{ itemId: "g01", value: true }]);
  });

  it("같은 항목을 여러 번 바꾸면 마지막 값만 남는다", () => {
    const queue = createSaveQueue(memoryStorage(), CODE);
    queue.enqueue("g03", true);
    queue.enqueue("g03", false);
    queue.enqueue("g03", true);
    expect(queue.peekAll()).toEqual([{ itemId: "g03", value: true }]);
  });

  it("선택 해제 값(false)이 보존된다", () => {
    const queue = createSaveQueue(memoryStorage(), CODE);
    queue.enqueue("a05", true);
    queue.enqueue("a05", false);
    expect(queue.peekAll()).toEqual([{ itemId: "a05", value: false }]);
  });

  it("여러 항목은 넣은 순서를 유지하고, 덮어써도 원래 위치를 유지한다", () => {
    const queue = createSaveQueue(memoryStorage(), CODE);
    queue.enqueue("g02", true);
    queue.enqueue("a01", true);
    queue.enqueue("g01", false);
    queue.enqueue("g02", false);
    expect(queue.peekAll()).toEqual([
      { itemId: "g02", value: false },
      { itemId: "a01", value: true },
      { itemId: "g01", value: false },
    ]);
    expect(queue.size()).toBe(3);
  });

  it("remove 후 나머지 목록이 순서대로 남는다", () => {
    const queue = createSaveQueue(memoryStorage(), CODE);
    queue.enqueue("g01", true);
    queue.enqueue("g02", true);
    queue.enqueue("g03", true);
    queue.remove("g02");
    expect(queue.peekAll().map((i) => i.itemId)).toEqual(["g01", "g03"]);
    queue.remove("없는항목");
    expect(queue.size()).toBe(2);
  });

  it("remove(itemId, ifValue) 는 값이 그대로일 때만 뺀다 (전송 중 값이 바뀐 경우 보호)", () => {
    const queue = createSaveQueue(memoryStorage(), CODE);
    queue.enqueue("g01", true);
    queue.enqueue("g01", false); // 전송 중에 사용자가 값을 바꿈
    queue.remove("g01", true); // 먼저 보낸 값(true)의 전송이 끝남
    expect(queue.peekAll()).toEqual([{ itemId: "g01", value: false }]);
    queue.remove("g01", false);
    expect(queue.peekAll()).toEqual([]);
  });

  it("새 큐 객체로 다시 열어도 저장소의 내용이 이어진다", () => {
    const storage = memoryStorage();
    createSaveQueue(storage, CODE).enqueue("g10", false);
    expect(createSaveQueue(storage, CODE).peekAll()).toEqual([{ itemId: "g10", value: false }]);
  });

  it("저장소 JSON 파싱에 실패하면 빈 목록으로 복구하고 계속 쓸 수 있다", () => {
    const storage = memoryStorage({ [queueKey(CODE)]: "{깨진 json" });
    const queue = createSaveQueue(storage, CODE);
    expect(queue.peekAll()).toEqual([]);
    queue.enqueue("g01", true);
    expect(queue.peekAll()).toEqual([{ itemId: "g01", value: true }]);
  });

  it("배열이 아니거나 형식이 틀린 항목은 걸러낸다", () => {
    const bad = JSON.stringify([{ itemId: "g01", value: true }, { itemId: 3, value: true }, null, "x", { itemId: "g01", value: false }, { itemId: "g02" }]);
    const queue = createSaveQueue(memoryStorage({ [queueKey(CODE)]: bad }), CODE);
    expect(queue.peekAll()).toEqual([{ itemId: "g01", value: true }]);

    const notArray = createSaveQueue(memoryStorage({ [queueKey(CODE)]: '{"a":1}' }), CODE);
    expect(notArray.peekAll()).toEqual([]);
  });

  it("저장소 쓰기가 실패해도 이번 방문 동안은 메모리로 동작한다", () => {
    const broken: QueueStorage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("quota");
      },
    };
    const queue = createSaveQueue(broken, CODE);
    queue.enqueue("g01", true);
    queue.enqueue("g02", false);
    expect(queue.peekAll()).toEqual([
      { itemId: "g01", value: true },
      { itemId: "g02", value: false },
    ]);
    queue.remove("g01");
    expect(queue.peekAll()).toEqual([{ itemId: "g02", value: false }]);
  });

  it("읽기는 가능하지만 용량 초과로 쓰기만 실패해도 새 응답과 화면 위치를 보존한다", () => {
    const storage: QueueStorage = {
      getItem: () => JSON.stringify([{ itemId: "g01", value: true }]),
      setItem: () => { throw new Error("quota exceeded"); },
    };
    const queue = createSaveQueue(storage, CODE);
    queue.enqueue("g01", false);
    queue.enqueue("g02", true);
    queue.enqueueStep("general-3");
    expect(queue.peekAll()).toEqual([
      { itemId: "g01", value: false },
      { itemId: "g02", value: true },
      { itemId: STEP_KEY, value: "general-3" },
    ]);
    queue.remove("g01", false);
    expect(queue.peekAll().map((item) => item.itemId)).toEqual(["g02", STEP_KEY]);
  });
});

describe("openOwnedQueue", () => {
  it("같은 세션이 다시 열면 대기 항목을 유지한다", () => {
    const storage = memoryStorage();
    openOwnedQueue(storage, CODE, "session-A").enqueue("g01", true);
    expect(openOwnedQueue(storage, CODE, "session-A").peekAll()).toEqual([{ itemId: "g01", value: true }]);
  });

  it("다른 세션이 이어받으면 이전 사람의 대기 항목을 버린다", () => {
    const storage = memoryStorage();
    openOwnedQueue(storage, CODE, "session-A").enqueue("g01", true);
    const queue = openOwnedQueue(storage, CODE, "session-B");
    expect(queue.peekAll()).toEqual([]);
    queue.enqueue("g02", false);
    expect(openOwnedQueue(storage, CODE, "session-B").peekAll()).toEqual([{ itemId: "g02", value: false }]);
  });

  it("소유자 표시가 없던 기존 대기 항목은 유지하고 소유자를 기록한다", () => {
    const storage = memoryStorage();
    createSaveQueue(storage, CODE).enqueue("g01", true);
    expect(openOwnedQueue(storage, CODE, "session-A").peekAll()).toEqual([{ itemId: "g01", value: true }]);
    expect(storage.data[`jd_pending_owner:${CODE}`]).toBe("session-A");
  });
});

describe("saveQueue __step__ 항목", () => {
  it("step 은 항상 최신 값 하나로 덮어쓴다", () => {
    const queue = createSaveQueue(memoryStorage(), CODE);
    queue.enqueueStep("general-2");
    queue.enqueueStep("general-3");
    queue.enqueueStep("general-4");
    expect(queue.peekAll()).toEqual([{ itemId: STEP_KEY, value: "general-4" }]);
    expect(STEP_KEY).toBe("__step__");
  });

  it("step 을 먼저 넣어도 응답 항목보다 뒤에 처리된다", () => {
    const queue = createSaveQueue(memoryStorage(), CODE);
    queue.enqueueStep("general-2");
    queue.enqueue("g01", true);
    queue.enqueue("g02", false);
    queue.enqueueStep("general-3");
    queue.enqueue("a01", true);
    expect(queue.peekAll().map((i) => i.itemId)).toEqual(["g01", "g02", "a01", STEP_KEY]);
    expect(queue.peekAll()[0]).toEqual({ itemId: "g01", value: true });
  });

  it("응답을 모두 뺀 뒤에야 step 이 맨 앞에 온다", () => {
    const queue = createSaveQueue(memoryStorage(), CODE);
    queue.enqueueStep("general-3");
    queue.enqueue("g01", true);
    queue.remove("g01", true);
    expect(queue.peekAll()).toEqual([{ itemId: STEP_KEY, value: "general-3" }]);
  });

  it("remove 는 step 값이 그대로일 때만 뺀다 (전송 중 새 step 이 들어온 경우 보호)", () => {
    const queue = createSaveQueue(memoryStorage(), CODE);
    queue.enqueueStep("general-3");
    queue.enqueueStep("general-4"); // 전송 중에 화면이 넘어감
    queue.remove(STEP_KEY, "general-3");
    expect(queue.peekAll()).toEqual([{ itemId: STEP_KEY, value: "general-4" }]);
    queue.remove(STEP_KEY, "general-4");
    expect(queue.peekAll()).toEqual([]);
  });

  it("ifValue 없이 remove(STEP_KEY) 하면 값과 상관없이 뺀다", () => {
    const queue = createSaveQueue(memoryStorage(), CODE);
    queue.enqueueStep("review");
    queue.remove(STEP_KEY);
    expect(queue.size()).toBe(0);
  });

  it("응답 항목과 step 이 섞여 있어도 저장소에서 다시 열면 그대로 복원된다", () => {
    const storage = memoryStorage();
    const queue = createSaveQueue(storage, CODE);
    queue.enqueueStep("general-4");
    queue.enqueue("g01", true);
    expect(createSaveQueue(storage, CODE).peekAll()).toEqual([
      { itemId: "g01", value: true },
      { itemId: STEP_KEY, value: "general-4" },
    ]);
  });

  it("step 은 문자열 값만, 응답은 boolean 값만 유효하다", () => {
    const raw = JSON.stringify([
      { itemId: STEP_KEY, value: true },
      { itemId: "g01", value: "general-2" },
      { itemId: STEP_KEY, value: "general-5" },
    ]);
    const queue = createSaveQueue(memoryStorage({ [queueKey(CODE)]: raw }), CODE);
    expect(queue.peekAll()).toEqual([{ itemId: STEP_KEY, value: "general-5" }]);
  });

  it("enqueue 로 __step__ 을 넣으면 오류다", () => {
    expect(() => createSaveQueue(memoryStorage(), CODE).enqueue(STEP_KEY, true)).toThrow();
  });

  it("isStepItem 은 step 항목만 구분한다", () => {
    expect(isStepItem({ itemId: STEP_KEY, value: "general-1" })).toBe(true);
    expect(isStepItem({ itemId: "g01", value: true })).toBe(false);
  });

  it("다른 사람이 이어받으면 대기 중인 step 도 버린다", () => {
    const storage = memoryStorage();
    openOwnedQueue(storage, CODE, "session-A").enqueueStep("general-9");
    expect(openOwnedQueue(storage, CODE, "session-B").peekAll()).toEqual([]);
  });
});
