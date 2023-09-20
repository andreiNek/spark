import { ApiAction } from "../interfaces/APIAction";
import { SparkApplications } from "../interfaces/SparkApplications";
import { SparkConfiguration } from "../interfaces/SparkConfiguration";
import { SparkExecutors } from "../interfaces/SparkExecutors";
import { SparkJobs } from "../interfaces/SparkJobs";
import { SparkSQLs } from '../interfaces/SparkSQLs';
import { SparkStages } from "../interfaces/SparkStages";
import { NodesMetrics } from '../interfaces/SqlMetrics';

const POLL_TIME = 1000

class SparkAPI {
    basePath: string
    initialized: boolean = false;
    appId: string = "";
    apiPath: string;
    applicationsPath: string;
    setStore: React.Dispatch<ApiAction>;

    private get applicationPath(): string {
        return `${this.apiPath}/applications/${this.appId}`
    }

    private get environmentPath(): string {
        return `${this.applicationPath}/environment`
    }

    private get sqlPath(): string {
        return `${this.applicationPath}/sql`
    }

    private get stagesPath(): string {
        return `${this.applicationPath}/stages`
    }

    private getSqlMetricsPath(sqlId: string): string {
        return `${this.applicationPath}/devtool/sql/${sqlId}`
    }

    private get executorsPath(): string {
        return `${this.applicationPath}/executors`
    }

    private get jobsPath(): string {
        return `${this.applicationPath}/jobs`
    }

    constructor(basePath: string, setStore: React.Dispatch<ApiAction>) {
        this.basePath = basePath;
        this.apiPath = `${basePath}/api/v1`;
        this.applicationsPath = `${this.apiPath}/applications`;
        this.setStore = setStore
    }

    start(): () => void {
        const timerId = setInterval(this.fetchData.bind(this), POLL_TIME)
        return () => clearInterval(timerId)
    }

    async fetchData(): Promise<void> {
        if (document.hidden) {
            // skip fetching when tab is not in focus
            // TODO: skip also the interval when tab is not in focus
            return;
        }
        try {
            if(!this.initialized) {
                this.initialized = true;
                const appData: SparkApplications = await (await fetch(this.applicationsPath)).json();
                this.appId = appData[0].id;
                const generalConfigParsed = appData[0].attempts[0];
                const currentSparkVersion = generalConfigParsed.appSparkVersion;

                const sparkConfiguration: SparkConfiguration = await (await fetch(this.environmentPath)).json();
                this.setStore({type: 'setInitial', config: sparkConfiguration, appId: this.appId, sparkVersion: currentSparkVersion });
            }
      
            const sparkStages: SparkStages = await (await fetch(this.stagesPath)).json();
            this.setStore({type: 'setStatus', value: sparkStages });

            const sparkExecutors: SparkExecutors = await (await fetch(this.executorsPath)).json();
            this.setStore({type: 'setSparkExecutors', value: sparkExecutors });

            const sparkJobs: SparkJobs = await (await fetch(this.jobsPath)).json();
            this.setStore({type: 'setSparkJobs', value: sparkJobs });

            const sparkSQLs: SparkSQLs = await (await fetch(this.sqlPath)).json();
            if(sparkSQLs.length !== 0) {
                this.setStore({type: 'setSQL', value: sparkSQLs });

                const runningSqlIds = sparkSQLs.filter(sql => sql.status === 'RUNNING').map(sql => sql.id)
                if(runningSqlIds.length !== 0) {
                    const sqlId = runningSqlIds[0];
                    const nodesMetrics: NodesMetrics = await (await fetch(this.getSqlMetricsPath(sqlId))).json();
                    this.setStore({type: 'setSQMetrics', value: nodesMetrics, sqlId: sqlId });
                }
            }

          } catch (e) {
            console.log(e);
          }
    }
}

export default SparkAPI;