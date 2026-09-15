use crate::error::AppError;

pub fn normalize(value: Option<&str>) -> String {
    value
        .filter(|value| ["system", "zh-CN", "en"].contains(value))
        .unwrap_or("system")
        .into()
}

pub fn commit(
    current: &mut String,
    preference: &str,
    persist: impl FnOnce() -> Result<(), AppError>,
) -> Result<(), AppError> {
    if !["system", "zh-CN", "en"].contains(&preference) {
        return Err(AppError::new(
            "settings.language.invalid",
            "Invalid language preference",
        ));
    }
    persist()?;
    *current = preference.into();
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{commit, normalize};
    use crate::error::AppError;
    use std::cell::RefCell;

    #[test]
    fn failed_save_preserves_runtime() {
        let mut current = "zh-CN".to_owned();
        let result = commit(&mut current, "en", || {
            Err(AppError::new(
                "settings.language.save_failed",
                "Simulated read-only storage",
            ))
        });
        assert_eq!(result.unwrap_err().code, "settings.language.save_failed");
        assert_eq!(current, "zh-CN");
    }

    #[test]
    fn successful_save_commits_system_preference_without_resolving_it() {
        let mut current = "en".to_owned();
        let persisted = RefCell::new(String::new());
        commit(&mut current, "system", || {
            *persisted.borrow_mut() = "system".into();
            Ok(())
        })
        .unwrap();
        assert_eq!(current, "system");
        assert_eq!(*persisted.borrow(), "system");
    }

    #[test]
    fn invalid_or_missing_values_fall_back_and_invalid_writes_do_not_run() {
        assert_eq!(normalize(None), "system");
        assert_eq!(normalize(Some("invalid")), "system");
        assert_eq!(normalize(Some("en")), "en");
        let mut current = "en".into();
        assert!(commit(&mut current, "fr", || panic!(
            "Invalid input must not write storage"
        ),)
        .is_err());
        assert_eq!(current, "en");
    }
}
