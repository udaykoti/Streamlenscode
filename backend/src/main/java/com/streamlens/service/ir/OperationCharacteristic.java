package com.streamlens.service.ir;

import java.util.Set;

public enum OperationCharacteristic {
    STATEFUL,
    SHORT_CIRCUITING,
    SIDE_EFFECT,
    ORDERING,
    UNORDERED,
    LAZY,
    NULLABLE_INPUT,
    NULLABLE_OUTPUT;

    public static Set<OperationCharacteristic> forOperation(OperationType type) {
        return switch (type) {
            case FILTER, MAP, FLATMAP, PEEK -> Set.of();
            case SORTED -> Set.of(STATEFUL, ORDERING, LAZY);
            case DISTINCT -> Set.of(STATEFUL, UNORDERED, LAZY);
            case LIMIT -> Set.of(STATEFUL, SHORT_CIRCUITING, LAZY);
            case SKIP -> Set.of(STATEFUL, LAZY);
            case REDUCE -> Set.of(SHORT_CIRCUITING);
            case COUNT -> Set.of();
            case TO_LIST, TO_SET, COLLECT -> Set.of();
            case FIND_FIRST, FIND_ANY -> Set.of(SHORT_CIRCUITING);
            case ANY_MATCH, ALL_MATCH, NONE_MATCH -> Set.of(SHORT_CIRCUITING);
        };
    }
}
