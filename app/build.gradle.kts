plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// O workflow do GitHub define GITHUB_RUN_NUMBER; localmente cai em 1.
val runNumber = (System.getenv("GITHUB_RUN_NUMBER") ?: "1").toIntOrNull() ?: 1

android {
    namespace = "com.aqwbot.app"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.aqwbot.app"
        minSdk = 24
        targetSdk = 34
        versionCode = runNumber
        versionName = "1.$runNumber"
    }

    // Keystore fixo: todo APK sai assinado com a mesma chave,
    // para a atualizacao por cima funcionar sem perder dados.
    signingConfigs {
        getByName("debug") {
            storeFile = file("aqwbot.keystore")
            storePassword = "aqwbot123"
            keyAlias = "aqwbot"
            keyPassword = "aqwbot123"
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("com.google.android.material:material:1.12.0")
    implementation("androidx.recyclerview:recyclerview:1.3.2")
}
