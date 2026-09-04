package com.streamlens.service.ir;

public enum OperationType {
    FILTER("filter"),
    MAP("map"),
    FLATMAP("flatMap"),
    SORTED("sorted"),
    DISTINCT("distinct"),
    LIMIT("limit"),
    SKIP("skip"),
    PEEK("peek"),
    REDUCE("reduce"),
    COLLECT("collect"),
    COUNT("count"),
    TO_LIST("toList"),
    TO_SET("toSet"),
    FIND_FIRST("findFirst"),
    FIND_ANY("findAny"),
    ANY_MATCH("anyMatch"),
    ALL_MATCH("allMatch"),
    NONE_MATCH("noneMatch");

    private final String methodName;

    OperationType(String methodName) {
        this.methodName = methodName;
    }

    public String getMethodName() {
        return methodName;
    }

    public boolean isIntermediate() {
        return switch (this) {
            case FILTER, MAP, FLATMAP, SORTED, DISTINCT, LIMIT, SKIP, PEEK -> true;
            default -> false;
        };
    }

    public boolean isTerminal() {
        return !isIntermediate();
    }

    public boolean isStateful() {
        return switch (this) {
            case SORTED, DISTINCT, LIMIT, SKIP -> true;
            default -> false;
        };
    }

    public boolean isShortCircuiting() {
        return switch (this) {
            case LIMIT, FIND_FIRST, FIND_ANY, ANY_MATCH, ALL_MATCH, NONE_MATCH -> true;
            default -> false;
        };
    }

    public boolean hasSideEffects() {
        return this == PEEK;
    }

    public static OperationType fromMethodName(String name) {
        for (OperationType type : values()) {
            if (type.methodName.equalsIgnoreCase(name)) {
                return type;
            }
        }
        return null;
    }
}
