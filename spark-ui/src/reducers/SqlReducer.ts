
import { EnrichedSparkSQL, EnrichedSqlMetric, NodeType, SparkSQLStore, EnrichedSqlEdge, EnrichedSqlNode, AppStore } from '../interfaces/AppStore';
import { SparkSQL, SparkSQLs, SqlStatus } from "../interfaces/SparkSQLs";
import { Edge, Graph } from 'graphlib';
import { v4 as uuidv4 } from 'uuid';
import { NodesMetrics } from "../interfaces/SqlMetrics";
import { calcNodeMetrics, calcNodeType, nodeEnrichedNameBuilder } from './SqlReducerUtils';
import { timeStrToEpocTime } from '../utils/FormatUtils';


export function cleanUpDAG(edges: EnrichedSqlEdge[], nodes: EnrichedSqlNode[]): [EnrichedSqlEdge[], EnrichedSqlNode[]] {
    var g = new Graph();
    nodes.forEach(node => g.setNode(node.nodeId.toString()));
    edges.forEach(edge => g.setEdge(edge.fromId.toString(), edge.toId.toString()));

    const notVisibleNodes = nodes.filter(node => !node.isVisible)

    notVisibleNodes.forEach(node => {
        const nodeId = node.nodeId.toString()
        const inEdges = g.inEdges(nodeId) as Edge[];
        if (inEdges === undefined) {
            return;
        }
        const targets = (g.outEdges(nodeId) as Edge[]);
        if (targets === undefined || targets.length === 0) {
            return;
        }
        const target = targets[0]
        inEdges.forEach(inEdge => g.setEdge(inEdge.v, target.w));
        g.removeNode(nodeId)

    });

    const filteredEdges: EnrichedSqlEdge[] = g.edges().map((edge: Edge) => { return { fromId: parseInt(edge.v), toId: parseInt(edge.w) } });

    return [filteredEdges, nodes.filter(node => node.isVisible)]
}

function calculateSql(sql: SparkSQL): EnrichedSparkSQL {
    const enrichedSql = sql as EnrichedSparkSQL;
    const originalNumOfNodes = enrichedSql.nodes.length;
    const typeEnrichedNodes = enrichedSql.nodes.map(node => {
        const type = calcNodeType(node.nodeName);
        return { ...node, type: type, isVisible: type !== "other", enrichedName: nodeEnrichedNameBuilder(node.nodeName) };
    });

    if (typeEnrichedNodes.filter(node => node.type === 'output').length === 0) {
        // if there is no output, update the last node which is not "AdaptiveSparkPlan" or WholeStageCodegen to be the output
        const filtered = typeEnrichedNodes.filter(node => node.nodeName !== "AdaptiveSparkPlan" && !node.nodeName.includes("WholeStageCodegen"))
        const lastNode = filtered[filtered.length - 1];
        lastNode.type = 'output';
        lastNode.isVisible = true;
    }

    const [filteredEdges, filteredNodes] = cleanUpDAG(enrichedSql.edges, typeEnrichedNodes);

    const metricEnrichedNodes = filteredNodes.map(node => {
        return { ...node, metrics: calcNodeMetrics(node.type, node.metrics) };
    });

    const isSqlCommand = sql.runningJobIds.length === 0 && sql.failedJobIds.length === 0 && sql.successJobIds.length === 0;

    return { 
        ...enrichedSql, 
        nodes: metricEnrichedNodes, 
        edges: filteredEdges, 
        uniqueId: uuidv4(), 
        metricUpdateId: uuidv4(), 
        isSqlCommand: isSqlCommand,
        originalNumOfNodes: originalNumOfNodes,
        submissionTimeEpoc: timeStrToEpocTime(sql.submissionTime)
     };
}

function calculateSqls(sqls: SparkSQLs): EnrichedSparkSQL[] {
    return sqls.map(calculateSql);
}

export function calculateSqlStore(currentStore: SparkSQLStore | undefined, sqls: SparkSQLs): SparkSQLStore {
    if (currentStore === undefined) {
        return { sqls: calculateSqls(sqls) };
    }

    const sqlIds = sqls.map(sql => parseInt(sql.id));
    const minId = Math.min(...sqlIds);

    // add existing completed IDs
    let updatedSqls: EnrichedSparkSQL[] = currentStore.sqls.slice(0, minId);


    for(const id of sqlIds) {
        const newSql = sqls.find(existingSql => parseInt(existingSql.id) === id) as SparkSQL;
        const currentSql = currentStore.sqls.find(existingSql => parseInt(existingSql.id) === id);

        // case 1: SQL does not exist, we add it
        if(currentSql === undefined) {
            updatedSqls.push(calculateSql(newSql));
        // From here currentSql must not be null, and currentSql can't be COMPLETED as it would not be requested by API
        // case 2: plan status changed from running to completed, so we need to update the SQL 
        } else if(newSql.status === SqlStatus.Completed.valueOf() || newSql.status === SqlStatus.Failed.valueOf()) {
            updatedSqls.push(calculateSql(newSql));
        // From here newSql.status must be RUNNING
        // case 3: running SQL structure, so we need to update the plan 
        } else if(currentSql.originalNumOfNodes !== newSql.nodes.length) {
            updatedSqls.push(calculateSql(newSql));
        } else {
            // case 4: SQL is running, but the structure haven't changed, so we update only relevant fields
            updatedSqls.push({...currentSql, duration: newSql.duration, failedJobIds: newSql.failedJobIds, runningJobIds: newSql.runningJobIds, successJobIds: newSql.successJobIds});
        }
    }

    return { sqls: updatedSqls };;
}

export function updateSqlNodeMetrics(currentStore: SparkSQLStore, sqlId: string, sqlMetrics: NodesMetrics): SparkSQLStore {
    const runningSqls = currentStore.sqls.filter(sql => sql.id === sqlId)
    if (runningSqls.length === 0) {
        // Shouldn't happen as if we ask for updated SQL metric we should have the SQL in store
        return currentStore;
    }

    const notEffectedSqls = currentStore.sqls.filter(sql => sql.id !== sqlId);
    const runningSql = runningSqls[0];
    const nodes = runningSql.nodes.map(node => {
        const matchedMetricsNodes = sqlMetrics.filter(nodeMetrics => nodeMetrics.id === node.nodeId);
        if (matchedMetricsNodes.length === 0) {
            return node;
        }
        // TODO: maybe do a smarter replacement, or send only the initialized metrics
        return { ...node, metrics: calcNodeMetrics(node.type, matchedMetricsNodes[0].metrics) }
    })

    const updatedSql = { ...runningSql, nodes: nodes, metricUpdateId: uuidv4() };
    return { ...currentStore, sqls: [...notEffectedSqls, updatedSql] };

}