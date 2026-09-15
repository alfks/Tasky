// 날짜 키 타입. 도메인이 날짜를 다루는 유일한 표기다(코드 컨벤션 §1).

/** 'YYYY-MM-DD' 형식의 날짜 키. 로컬 타임존 기준의 하루를 가리킨다. */
export type DateKey = `${number}-${number}-${number}`;
