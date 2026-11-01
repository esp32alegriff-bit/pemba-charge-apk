import org.gradle.api.JavaVersion

plugins {
    id("com.android.application")
}

android {
    namespace = "za.co.farrusco.farrqcharge"
    compileSdk = 35

    defaultConfig {
        applicationId = "za.co.farrusco.pembacharge1"
        minSdk = 26
        targetSdk = 34
        versionCode = 1
        versionName = "1.0.0.1"
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    signingConfigs {
        create("permanentRelease") {
            val store = providers.environmentVariable("FARRQ_SIGNING_STORE_FILE").orNull
            if (store != null) {
                storeFile = file(store)
                storePassword = providers.environmentVariable("FARRQ_SIGNING_STORE_PASSWORD").orNull
                keyAlias = providers.environmentVariable("FARRQ_SIGNING_KEY_ALIAS").orNull
                keyPassword = providers.environmentVariable("FARRQ_SIGNING_KEY_PASSWORD").orNull
            }
        }
    }

    buildTypes {
        getByName("release") {
            signingConfig = signingConfigs.getByName("permanentRelease")
            isMinifyEnabled = false
        }
    }

    lint {
        abortOnError = false
        checkReleaseBuilds = false
    }
}
