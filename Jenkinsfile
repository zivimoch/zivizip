pipeline {
    agent { label 'zivizip-trusted' }
    options {
        skipDefaultCheckout(true)
        disableConcurrentBuilds()
        timestamps()
        timeout(time: 45, unit: 'MINUTES')
        buildDiscarder(logRotator(numToKeepStr: '15'))
    }
    triggers { pollSCM('H/2 * * * *') }
    stages {
        stage('Checkout') {
            steps {
                checkout scm
                script { env.RELEASE = sh(script: 'git rev-parse HEAD', returnStdout: true).trim() }
            }
        }
        stage('Build and test') {
            steps {
                sh 'docker build --target preview -f apps/web/Dockerfile -t zivizip-web:$RELEASE .'
                sh 'docker build -f services/notes/Dockerfile -t zivizip-api:$RELEASE .'
                sh 'docker build -f deploy/jenkins/browser.Dockerfile -t zivizip-browser:$RELEASE .'
            }
        }
        stage('Browser verification') {
            steps {
                sh '''
                    set -eu
                    set +x
                    network=zivizip-ci-$BUILD_NUMBER
                    api=zivizip-ci-api-$BUILD_NUMBER
                    browser=zivizip-ci-browser-$BUILD_NUMBER
                    credential=$(mktemp)
                    trap 'docker rm -f "$browser" "$api" >/dev/null 2>&1 || true; docker network rm "$network" >/dev/null 2>&1 || true; rm -f "$credential"' EXIT
                    password=$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \\n')
                    printf '{"username":"ci-owner","password":"%s"}' "$password" > "$credential"
                    chmod 644 "$credential"
                    docker network create "$network"
                    docker create --name "$api" --network "$network" --network-alias notes -e OWNER_FILE=/tmp/owner.json -e DATABASE_PATH=/data/notes.sqlite -e ALLOWED_ORIGINS=http://127.0.0.1:4174 -e COOKIE_SECURE=false zivizip-api:$RELEASE
                    docker cp "$credential" "$api":/tmp/owner.json
                    docker start "$api"
                    docker create --name "$browser" --network "$network" zivizip-browser:$RELEASE
                    docker cp "$credential" "$browser":/app/.local/owner.json
                    set +e
                    docker start -a "$browser"
                    result=$?
                    docker cp "$browser":/app/apps/web/test-results ./browser-results
                    exit "$result"
                '''
            }
        }
        stage('Deploy production') {
            steps {
                sh '''docker save zivizip-web:$RELEASE zivizip-api:$RELEASE | ssh -i /run/secrets/deploy_key -o IdentitiesOnly=yes -o BatchMode=yes -o UserKnownHostsFile=/run/secrets/known_hosts root@"$DEPLOY_HOST" "release $RELEASE"'''
            }
        }
    }
    post {
        always {
            archiveArtifacts artifacts: 'browser-results/**/*', allowEmptyArchive: true
            sh 'if [ -n "$RELEASE" ]; then docker image rm zivizip-browser:$RELEASE zivizip-web:$RELEASE zivizip-api:$RELEASE || true; fi'
        }
    }
}
