package com.streamlens.service.explanation;

import com.streamlens.model.Explanation;
import com.streamlens.service.ir.OperationType;
import com.streamlens.service.ir.StreamOperation;
import com.streamlens.service.ir.StreamPipeline;
import org.springframework.stereotype.Service;

import java.util.*;

@Service
public class ExplanationEngine {

    private final Map<OperationType, String> operationBeginnerDescriptions = Map.of(
        OperationType.FILTER, "Keeps only elements that match a condition",
        OperationType.MAP, "Transforms each element using a function",
        OperationType.FLATMAP, "Transforms each element into zero or more elements",
        OperationType.SORTED, "Sorts elements in natural order",
        OperationType.DISTINCT, "Removes duplicate elements",
        OperationType.LIMIT, "Takes only the first N elements",
        OperationType.SKIP, "Skips the first N elements",
        OperationType.PEEK, "Performs a side effect on each element without changing the stream"
    );

    private final Map<OperationType, String> operationTechnicalDescriptions = Map.of(
        OperationType.FILTER, "Applies a Predicate<T> to each element; retains elements where the predicate evaluates to true",
        OperationType.MAP, "Applies a Function<T,R> to each element, producing one output element per input element",
        OperationType.FLATMAP, "Applies a Function<T, Stream<R>> to each element, flattening the resulting streams",
        OperationType.SORTED, "Returns a stream consisting of the elements sorted by natural order (stateful, requires full traversal)",
        OperationType.DISTINCT, "Returns a stream with distinct elements (stateful, uses equals/hashCode)",
        OperationType.LIMIT, "Returns a stream with at most N elements (stateful, short-circuiting)",
        OperationType.SKIP, "Discards the first N elements (stateful)",
        OperationType.PEEK, "Performs an action on each element as it passes through (side-effecting)"
    );

    public List<Explanation> generatePipelineExplanations(StreamPipeline pipeline) {
        List<Explanation> explanations = new ArrayList<>();

        explanations.add(new Explanation("beginner", "What this code does",
            generateBeginnerPipelineSummary(pipeline)));
        explanations.add(new Explanation("developer", "Pipeline structure",
            generateDeveloperPipelineSummary(pipeline)));
        explanations.add(new Explanation("advanced", "Semantic analysis",
            generateAdvancedPipelineSummary(pipeline)));

        return explanations;
    }

    public List<Explanation> generateTransformationExplanations(
        StreamPipeline original, StreamPipeline alternative, String classification) {
        List<Explanation> explanations = new ArrayList<>();

        explanations.add(new Explanation("beginner", "What changed",
            generateBeginnerTransformationSummary(original, alternative, classification)));
        explanations.add(new Explanation("developer", "Transformation details",
            generateDeveloperTransformationSummary(original, alternative, classification)));
        explanations.add(new Explanation("advanced", "Semantic analysis of transformation",
            generateAdvancedTransformationSummary(original, alternative, classification)));

        return explanations;
    }

    private String generateBeginnerPipelineSummary(StreamPipeline pipeline) {
        StringBuilder sb = new StringBuilder();
        sb.append("This Java Stream code starts with a collection of data and applies ");
        sb.append(pipeline.getIntermediateOperations().size());
        sb.append(" operation");
        if (pipeline.getIntermediateOperations().size() != 1) sb.append("s");
        sb.append(" to transform it.\n\n");

        for (StreamOperation op : pipeline.getIntermediateOperations()) {
            String desc = operationBeginnerDescriptions.getOrDefault(op.getType(),
                "Performs the " + op.getType().getMethodName() + " operation");
            sb.append("  - ").append(op.getType().getMethodName()).append("(): ").append(desc).append("\n");
        }

        if (pipeline.getTerminalOperation() != null) {
            sb.append("\nFinally, ").append(pipeline.getTerminalOperation().getType().getMethodName());
            sb.append("() collects the result.");
        }

        return sb.toString();
    }

    private String generateDeveloperPipelineSummary(StreamPipeline pipeline) {
        StringBuilder sb = new StringBuilder();
        sb.append("Pipeline: ");
        sb.append(pipeline.getSourceType()).append(".stream()");

        for (StreamOperation op : pipeline.getIntermediateOperations()) {
            sb.append(" → ").append(op.getType().getMethodName());
            if (op.getLambdaExpression() != null) {
                sb.append("(").append(op.getLambdaExpression()).append(")");
            }
        }

        if (pipeline.getTerminalOperation() != null) {
            sb.append(" → ").append(pipeline.getTerminalOperation().getType().getMethodName());
            sb.append("()");
        }

        sb.append("\n\n");
        sb.append("Characteristics:\n");
        if (pipeline.hasStatefulOperation()) {
            sb.append("  - Contains stateful operations (sorted, distinct, limit, skip)\n");
        }
        if (pipeline.hasShortCircuitingOperation()) {
            sb.append("  - Contains short-circuiting operations\n");
        }
        if (pipeline.hasSideEffects()) {
            sb.append("  - Contains side-effecting operations (peek)\n");
        }
        if (pipeline.isParallel()) {
            sb.append("  - Parallel stream\n");
        }

        return sb.toString();
    }

    private String generateAdvancedPipelineSummary(StreamPipeline pipeline) {
        StringBuilder sb = new StringBuilder();
        sb.append("Semantic Profile:\n\n");

        List<StreamOperation> ops = pipeline.getIntermediateOperations();
        boolean hasFilter = ops.stream().anyMatch(op -> op.getType() == OperationType.FILTER);
        boolean hasMap = ops.stream().anyMatch(op -> op.getType() == OperationType.MAP);
        boolean hasSort = ops.stream().anyMatch(op -> op.getType() == OperationType.SORTED);
        boolean hasDistinct = ops.stream().anyMatch(op -> op.getType() == OperationType.DISTINCT);
        boolean hasLimit = ops.stream().anyMatch(op -> op.getType() == OperationType.LIMIT);

        if (hasFilter && hasMap) {
            sb.append("filter + map composition: ");
            sb.append("The relative order of filter and map affects both the number of elements processed ");
            sb.append("and the values that filter evaluates. This is a key transformation candidate.\n\n");
        }

        if (hasSort && hasLimit) {
            sb.append("sorted + limit composition: ");
            sb.append("This is a well-known optimization pattern. Taking the first N from a sorted stream ");
            sb.append("is equivalent to using a priority queue of size N. Consider using a more efficient ");
            sb.append("algorithm if N is small relative to the stream size.\n\n");
        }

        if (hasDistinct && hasSort) {
            sb.append("distinct + sorted interaction: ");
            sb.append("distinct is order-independent; sorting after distinct is safe. However, ");
            sb.append("distinct after sorting may yield different 'first' elements in edge cases.\n\n");
        }

        sb.append("Operation dependency graph:\n");
        for (int i = 0; i < ops.size(); i++) {
            StreamOperation op = ops.get(i);
            sb.append("  [").append(i).append("] ").append(op.getType().getMethodName());
            if (op.isStateful()) sb.append(" (stateful)");
            if (op.isShortCircuiting()) sb.append(" (short-circuit)");
            if (op.isHasSideEffects()) sb.append(" (side-effect)");
            sb.append("\n");
        }

        return sb.toString();
    }

    private String generateBeginnerTransformationSummary(
        StreamPipeline original, StreamPipeline alternative, String classification) {
        List<String> origOps = original.getIntermediateOperations().stream()
            .map(op -> op.getType().getMethodName()).toList();
        List<String> altOps = alternative.getIntermediateOperations().stream()
            .map(op -> op.getType().getMethodName()).toList();

        String msg = switch (classification) {
            case "SAFE" -> "This change is SAFE. The operations can be reordered without affecting the result.";
            case "CONDITIONALLY SAFE" -> "This change is CONDITIONALLY SAFE. It's safe only under certain conditions (e.g., specific lambda expressions).";
            case "UNSAFE" -> "This change is UNSAFE. Reordering these operations produces different results.";
            default -> "We couldn't determine if this change is safe. More analysis is needed.";
        };

        return "Original order: " + String.join(" → ", origOps) + "\n" +
               "New order: " + String.join(" → ", altOps) + "\n\n" +
               msg;
    }

    private String generateDeveloperTransformationSummary(
        StreamPipeline original, StreamPipeline alternative, String classification) {
        StringBuilder sb = new StringBuilder();

        sb.append("Transformation Analysis\n");
        sb.append("========================\n\n");

        sb.append("Original:    ");
        for (StreamOperation op : original.getIntermediateOperations()) {
            sb.append(op.getType().getMethodName()).append(" → ");
        }
        sb.append("terminal\n");

        sb.append("Alternative: ");
        for (StreamOperation op : alternative.getIntermediateOperations()) {
            sb.append(op.getType().getMethodName()).append(" → ");
        }
        sb.append("terminal\n\n");

        sb.append("Classification: ").append(classification).append("\n\n");

        sb.append("Semantic considerations:\n");
        for (StreamOperation op : original.getIntermediateOperations()) {
            if (op.isStateful()) {
                sb.append("  - ").append(op.getType().getMethodName())
                  .append(" is stateful: its position in the pipeline affects downstream operations\n");
            }
            if (op.isHasSideEffects()) {
                sb.append("  - ").append(op.getType().getMethodName())
                  .append(" has side effects: reordering changes when side effects execute\n");
            }
        }

        return sb.toString();
    }

    private String generateAdvancedTransformationSummary(
        StreamPipeline original, StreamPipeline alternative, String classification) {
        StringBuilder sb = new StringBuilder();
        sb.append("Semantic Equivalence Analysis\n");
        sb.append("==============================\n\n");

        List<StreamOperation> origOps = original.getIntermediateOperations();
        List<StreamOperation> altOps = alternative.getIntermediateOperations();

        Set<OperationType> origStateful = origOps.stream()
            .filter(StreamOperation::isStateful).map(StreamOperation::getType).collect(java.util.stream.Collectors.toSet());
        Set<OperationType> altStateful = altOps.stream()
            .filter(StreamOperation::isStateful).map(StreamOperation::getType).collect(java.util.stream.Collectors.toSet());

        if (!origStateful.equals(altStateful)) {
            sb.append("WARNING: Stateful operation ordering changed.\n");
            sb.append("Original stateful ops: ").append(origStateful).append("\n");
            sb.append("Alternative stateful ops: ").append(altStateful).append("\n\n");
        }

        boolean hasFilterMapSwap = false;
        for (int i = 0; i < origOps.size(); i++) {
            for (int j = 0; j < altOps.size(); j++) {
                if (origOps.get(i).getType() == OperationType.FILTER &&
                    altOps.get(j).getType() == OperationType.MAP &&
                    i < j) {
                    hasFilterMapSwap = true;
                }
            }
        }

        if (hasFilterMapSwap) {
            sb.append("Filter-Map swap detected.\n");
            sb.append("This transformation is semantically safe IF AND ONLY IF:\n");
            sb.append("  1. The map function does not produce values that would pass the filter\n");
            sb.append("  2. The filter predicate does not depend on the original (pre-map) value\n");
            sb.append("  3. No side effects are involved\n");
            sb.append("Without proving these conditions, the classification is CONDITIONALLY SAFE.\n\n");
        }

        sb.append("Assumptions for equivalence:\n");
        sb.append("  - Lambda expressions are pure functions (no side effects)\n");
        sb.append("  - Input data is deterministic\n");
        sb.append("  - Sequential execution semantics\n");
        sb.append("  - No concurrent modification\n");

        return sb.toString();
    }
}
