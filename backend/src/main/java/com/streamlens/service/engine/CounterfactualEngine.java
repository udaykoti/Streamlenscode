package com.streamlens.service.engine;

import com.streamlens.service.ir.OperationType;
import com.streamlens.service.ir.StreamOperation;
import com.streamlens.service.ir.StreamPipeline;
import org.springframework.stereotype.Service;

import java.util.*;

@Service
public class CounterfactualEngine {

    private record TransformationRule(
        OperationType a, OperationType b,
        String classification, String reason
    ) {}

    private final List<TransformationRule> rules = List.of(
        new TransformationRule(OperationType.FILTER, OperationType.MAP,
            "CONDITIONALLY SAFE", "Safe when map() does not affect the filter predicate's evaluated value"),
        new TransformationRule(OperationType.FILTER, OperationType.MAP,
            "CONDITIONALLY SAFE", "Safe when the map operation does not produce values that would pass the filter"),

        new TransformationRule(OperationType.FILTER, OperationType.SORTED,
            "SAFE", "filter does not depend on element ordering"),

        new TransformationRule(OperationType.FILTER, OperationType.DISTINCT,
            "SAFE", "filter operates on individual elements regardless of duplicates"),

        new TransformationRule(OperationType.FILTER, OperationType.LIMIT,
            "CONDITIONALLY SAFE", "Only safe when filter is selective enough that limit is still reached"),

        new TransformationRule(OperationType.FILTER, OperationType.SKIP,
            "CONDITIONALLY SAFE", "Only safe when the filtered result count is unaffected by skip"),

        new TransformationRule(OperationType.FILTER, OperationType.FLATMAP,
            "CONDITIONALLY SAFE", "Safe when flatMap does not produce values that affect filter evaluation"),

        new TransformationRule(OperationType.MAP, OperationType.SORTED,
            "CONDITIONALLY SAFE", "Safe when map preserves the sort order (monotonic functions)"),

        new TransformationRule(OperationType.MAP, OperationType.DISTINCT,
            "CONDITIONALLY SAFE", "Safe when map is injective (one-to-one mapping)"),

        new TransformationRule(OperationType.MAP, OperationType.LIMIT,
            "UNSAFE", "map() changes element values, affecting which elements pass limit()"),

        new TransformationRule(OperationType.MAP, OperationType.SKIP,
            "CONDITIONALLY SAFE", "map does not affect element count, but skip depends on ordering after map"),

        new TransformationRule(OperationType.SORTED, OperationType.LIMIT,
            "SAFE", "Reordering sorted and limit is safe: take the smallest N elements regardless of order"),

        new TransformationRule(OperationType.SORTED, OperationType.DISTINCT,
            "CONDITIONALLY SAFE", "distinct after sorted is safe, but distinct before sorted may change which elements survive"),

        new TransformationRule(OperationType.DISTINCT, OperationType.LIMIT,
            "CONDITIONALLY SAFE", "distinct before limit may yield different elements than limit before distinct"),

        new TransformationRule(OperationType.SORTED, OperationType.FILTER,
            "SAFE", "filtering before or after sorting produces the same elements (just sorted differently)"),

        new TransformationRule(OperationType.MAP, OperationType.FILTER,
            "CONDITIONALLY SAFE", "Safe when the filter predicate does not depend on the mapped value"),

        new TransformationRule(OperationType.LIMIT, OperationType.SKIP,
            "SAFE", "limit then skip is equivalent to skip then limit with adjusted count")
    );

    public List<Map<String, Object>> generateAlternatives(StreamPipeline pipeline) {
        List<Map<String, Object>> alternatives = new ArrayList<>();
        List<StreamOperation> ops = pipeline.getIntermediateOperations();

        if (ops.size() < 2) return alternatives;

        for (int i = 0; i < ops.size(); i++) {
            for (int j = i + 1; j < ops.size(); j++) {
                StreamOperation a = ops.get(i);
                StreamOperation b = ops.get(j);

                if (isSwappable(a.getType(), b.getType())) {
                    List<StreamOperation> reordered = new ArrayList<>(ops);
                    reordered.set(i, b);
                    reordered.set(j, a);

                    Map<String, Object> alt = new LinkedHashMap<>();
                    alt.put("originalOrder", ops.stream()
                        .map(op -> op.getType().getMethodName()).toList());
                    alt.put("alternativeOrder", reordered.stream()
                        .map(op -> op.getType().getMethodName()).toList());
                    alt.put("swappedPositions", Map.of("from", i, "to", j));
                    alt.put("operationA", a.getType().getMethodName());
                    alt.put("operationB", b.getType().getMethodName());

                    TransformationRule rule = findRule(a.getType(), b.getType());
                    if (rule != null) {
                        alt.put("classification", rule.classification());
                        alt.put("reason", rule.reason());
                    } else {
                        alt.put("classification", "UNKNOWN");
                        alt.put("reason", "No semantic rule defined for this transformation pair");
                    }

                    alt.put("reorderedOperations", reordered.stream()
                        .map(this::operationToMap).toList());
                    alternatives.add(alt);
                }
            }
        }

        return alternatives;
    }

    public List<Map<String, Object>> generateAllPermutations(StreamPipeline pipeline) {
        List<StreamOperation> ops = pipeline.getIntermediateOperations();
        List<Map<String, Object>> results = new ArrayList<>();
        List<List<StreamOperation>> perms = new ArrayList<>();
        permute(ops, 0, perms);

        for (List<StreamOperation> perm : perms) {
            if (perm.equals(ops)) continue;

            Map<String, Object> alt = new LinkedHashMap<>();
            alt.put("originalOrder", ops.stream()
                .map(op -> op.getType().getMethodName()).toList());
            alt.put("alternativeOrder", perm.stream()
                .map(op -> op.getType().getMethodName()).toList());
            alt.put("reorderedOperations", perm.stream()
                .map(this::operationToMap).toList());
            alt.put("classification", classifyPermutation(ops, perm));
            results.add(alt);
        }

        return results;
    }

    private void permute(List<StreamOperation> ops, int k, List<List<StreamOperation>> results) {
        if (k == ops.size()) {
            results.add(new ArrayList<>(ops));
            return;
        }
        for (int i = k; i < ops.size(); i++) {
            Collections.swap(ops, i, k);
            permute(ops, k + 1, results);
            Collections.swap(ops, k, i);
        }
    }

    private boolean isSwappable(OperationType a, OperationType b) {
        if (a.isTerminal() || b.isTerminal()) return false;
        if (a == b) return false;

        if (a.hasSideEffects() || b.hasSideEffects()) return false;
        if (a.isShortCircuiting() && b.isStateful()) return false;
        if (b.isShortCircuiting() && a.isStateful()) return false;

        return true;
    }

    private TransformationRule findRule(OperationType a, OperationType b) {
        for (TransformationRule rule : rules) {
            if ((rule.a() == a && rule.b() == b) || (rule.a() == b && rule.b() == a)) {
                return rule;
            }
        }
        return null;
    }

    private String classifyPermutation(List<StreamOperation> original, List<StreamOperation> reordered) {
        Set<OperationType> originalTypes = new LinkedHashSet<>();
        Set<OperationType> reorderedTypes = new LinkedHashSet<>();
        for (StreamOperation op : original) originalTypes.add(op.getType());
        for (StreamOperation op : reordered) reorderedTypes.add(op.getType());

        if (originalTypes.equals(reorderedTypes) &&
            originalTypes.stream().noneMatch(OperationType::hasSideEffects) &&
            originalTypes.stream().noneMatch(OperationType::isShortCircuiting)) {
            return "POSSIBLY SAFE";
        }

        for (int i = 0; i < original.size(); i++) {
            for (int j = i + 1; j < reordered.size(); j++) {
                TransformationRule rule = findRule(original.get(i).getType(), reordered.get(j).getType());
                if (rule != null && "UNSAFE".equals(rule.classification())) {
                    return "UNSAFE";
                }
            }
        }

        return "UNKNOWN";
    }

    private Map<String, Object> operationToMap(StreamOperation op) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("type", op.getType().name());
        map.put("displayName", op.getType().getMethodName());
        map.put("lambdaExpression", op.getLambdaExpression());
        map.put("stateful", op.isStateful());
        map.put("shortCircuiting", op.isShortCircuiting());
        return map;
    }
}
